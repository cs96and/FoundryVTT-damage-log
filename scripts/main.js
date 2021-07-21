/*
 * Damage Log
 * https://github.com/cs96and/FoundryVTT-damage-log
 *
 * Copyright (c) 2021 Alan Davies - All Rights Reserved.
 *
 * You may use, distribute and modify this code under the terms of the MIT license.
 *
 * You should have received a copy of the MIT license with this file. If not, please visit:
 * https://mit-license.org/
 */

import { DamageLogSettings } from "./settings.js";

class DamageLog {

	static TABS_TEMPLATE = "modules/damage-log/templates/damage-log-tabs.hbs";
	static TABLE_TEMPLATE = "modules/damage-log/templates/damage-log-table.hbs";

	constructor() {
		this.settings = new DamageLogSettings();
		this.prevFlags = null;
		this.tabs = null;
		this.currentTab = "chat";
		this.hasTabbedChatlog = !!game.modules.get("tabbed-chatlog")?.active;

		loadTemplates([DamageLog.TABS_TEMPLATE, DamageLog.TABLE_TEMPLATE]);

		Hooks.once('getChatLogEntryContext', this._onGetChatLogEntryContext.bind(this));
		Hooks.on('preUpdateActor', this._onPreUpdateActor.bind(this));
		Hooks.on('renderChatMessage', this._onRenderChatMessage.bind(this));
		if (this.settings.useTab)
		{
			Hooks.on("renderChatLog", this._onRenderChatLog.bind(this));
			Hooks.on('changeSidebarTab', this._onChangeSidebarTab.bind(this));
		}
	}

	_onGetChatLogEntryContext(html, options) {
		const canUndo = li => {
			if (game.user.isGM) return true;
			if (!this.settings.allowPlayerUndo) return false;

			const message = game.messages.get(li.data("messageId"));
			const actor = game.actors.get(message?.data?.speaker?.actor);
			return actor?.testUserPermission(game.user, CONST.ENTITY_PERMISSIONS.OWNER);
		};

		options.push(
			{
				name: game.i18n.localize("damage-log.undo-damage"),
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => canUndo(li) && li.hasClass("damage-log") && li.hasClass("damage") && !li.hasClass("reverted"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.undo-healing"),
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => canUndo(li) && li.hasClass("damage-log") && li.hasClass("healing") && !li.hasClass("reverted"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.redo-damage"),
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => canUndo(li) && li.hasClass("damage-log") && li.hasClass("damage") && li.hasClass("reverted"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.redo-healing"),
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => canUndo(li) && li.hasClass("damage-log") && li.hasClass("healing") && li.hasClass("reverted"),
				callback: li => DamageLog._undoDamage(li)
			}
		);
	}

	async _onRenderChatLog(chatLog, html, user) {
		if (!game.user.isGM && !this.settings.allowPlayerView) return;

		if (this.hasTabbedChatlog)
		{
			// Force Tabbed Chatlog to render first
			setTimeout(() => this._onTabbedChatlogRenderChatLog(chatLog, html, user), 0)
			return;
		}

		const tabsHtml = await renderTemplate(DamageLog.TABS_TEMPLATE);
		html.prepend(tabsHtml);

		this.tabs = new Tabs({
			navSelector: ".damage-log.tabs",
			contentSelector: undefined,
			initial: this.currentTab,
			callback: this._onTabSwitch.bind(this)
		});
		this.tabs.bind(html[0]);
	}

	_onTabbedChatlogRenderChatLog(chatLog, html, user) {
		// Append our tab to the end of Tabbed Chatlog's tabs
		const tabs = $(".tabbedchatlog.tabs");
		tabs.append(`<a class="item damage-log" data-tab="damage-log">${game.i18n.localize("damage-log.damage-log-tab-name")}</a>`);

		// Override Tabbed Chatlog's callback to call our _onTabSwitch() function first.
		const tabbedChatlogCallback = game.tabbedchat.tabs.callback;
		game.tabbedchat.tabs.callback = ((event, html, tab) => {
			this._onTabSwitch(event, html, tab);
			tabbedChatlogCallback(event, html, tab);
		});
	}

	_onTabSwitch(event, html, tab) {
		this.currentTab = tab;
		const damageLogMessages = $(".chat-message.message.damage-log");
		const chatMessages = $(".chat-message.message:not(.damage-log)");

		if (tab === "damage-log")
		{
			chatMessages.hide();
			damageLogMessages.show();
			if (this.hasTabbedChatlog)
			{
				damageLogMessages.removeClass("hardHide");
				damageLogMessages.removeClass("hard-hide");
				damageLogMessages.addClass("hard-show");
			}
		}
		else
		{
			chatMessages.show();
			damageLogMessages.hide();
			if (this.hasTabbedChatlog)
			{
				damageLogMessages.addClass("hardHide");
				damageLogMessages.addClass("hard-hide");
				damageLogMessages.removeClass("hard-show");
			}
		}

		$("#chat-log").scrollTop(9999999);
	}

	async _onPreUpdateActor(actor, updateData, options, userId) {
		if (userId !== game.user.id) return;
		if (options.damageLog?.isRevert) return;

		// TODO - getSpeaker should really expect a TokenDocument, but there is currently a bug in Foundry 0.8.8
		// that makes it only accept a Token.  Once 0.8.9 is released, change this to send the TokenDocument instead.
		const speaker = ChatMessage.getSpeaker({ actor, token: actor.token?._object });

		// For "real" (i.e. non-synthetic) actors, make sure there is a linked token in the current scene.
		if (!actor.isToken) {
			const activeTokens = actor.getActiveTokens({linked: true});
			if (!activeTokens.find(i => i.id === speaker.token))
				return;
		}

		let oldTemp = 0, newTemp = 0;
		let oldValue = 0, newValue = 0;
		switch (game.system.id)
		{
			case "dnd5e":
			case "D35E":
			case "pf1":
			case "pf2e":
			{
				const oldHp = actor.data.data.attributes.hp;
				const newHp = updateData.data?.attributes?.hp;

				oldTemp = oldHp.temp ?? 0;
				newTemp = newHp.temp ?? oldTemp;
		
				oldValue = oldHp.value ?? 0;
				newValue = newHp.value ?? oldValue;
				break;
			}

			case "worldbuilding":
			{
				const oldHp = actor.data.data?.health;
				const newHp = updateData.data?.health;

				oldValue = oldHp.value ?? 0;
				newValue = newHp.value ?? 0;
				break;
			}

			default:
				return;
		}

		const tempDiff = newTemp - oldTemp;
		const valueDiff = newValue - oldValue;
		const totalDiff = tempDiff + valueDiff;

		if ((0 === tempDiff) && (0 === valueDiff)) return;

		const flags = {
			speaker,
			temp: { old: oldTemp, new: newTemp, diff: tempDiff },
			value: { old: oldValue, new: newValue, diff: valueDiff }
		};

		// There is a bug in Foundry 0.8.8 that causes preUpdateActor to fire multiple times.
		// Ignore duplicate updates.
		const stringifiedFlags = JSON.stringify(flags);
		if (stringifiedFlags !== this.prevFlags)
		{
			this.prevFlags = stringifiedFlags;

			// No need to keep the speaker data in the flags, because it is also in the chatData.
			// We only kept it in there briefly for the stringify check.
			delete flags.speaker;

			if (this.settings.useTab && this.hasTabbedChatlog)
			{
				// If the rolls notification is not currently showing, set a flag so we can prevent it from showing in _onRenderChatMessage.
				const rollsNotification = $("#rollsNotification")[0];
				if (rollsNotification?.style.display === "none")
					flags.preventRollsNotification = true;
			}

			const canView = (user, actorData) => {
				if (user.isGM) return true;

				const userPermission = actorData.permission[user.id] ?? actorData.permission.default;
				return (userPermission >= this.settings.minPlayerPermission);
			}

			const chatData = {
				content: await renderTemplate(DamageLog.TABLE_TEMPLATE, flags),
				flags: { damageLog: flags },
				flavor: game.i18n.format((totalDiff < 0 ? "damage-log.damage-flavor-text" : "damage-log.healing-flavor-text"), { diff: Math.abs(totalDiff) }),
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				speaker,
				whisper: game.users.contents.filter(user => canView(user, actor.data)).map(user => user.id)
			};

			ChatMessage.create(chatData, {});
		}
	}

	async _onRenderChatMessage(chatMessage, html, messageData) {
		if (this.settings.useTab && this.hasTabbedChatlog)
		{
			// Force Tabbed Chatlog to render first.
			await new Promise(r => setTimeout(r, 0));
		}

		const hp = messageData.message?.flags?.damageLog;
		if (!hp) {
			if (this.settings.useTab && (this.currentTab === "damage-log"))
				html.hide();
			return;
		}

		// If the rolls notification wasn't showing before the message was created, then hide it again.
		// TODO - this currently only works for the user that modified the token.
		if (hp.preventRollsNotification)
			$("#rollsNotification").hide();

		html.addClass("damage-log");

		if ((0 !== hp.temp.diff) || (0 !== hp.value.diff))
		{
			if ((hp.temp.diff <= 0) && (hp.value.diff <= 0))
				html.addClass("damage");
			else if ((hp.temp.diff >= 0) && (hp.value.diff >= 0))
				html.addClass("healing");
		}

		if (this.settings.useTab)
		{
			if (this.currentTab === "damage-log")
			{
				if (this.hasTabbedChatlog)
				{
					html.removeClass("hardHide");
					html.removeClass("hard-hide");
					html.addClass("hard-show");
				}
			}
			else
			{
				html.hide();
				if (this.hasTabbedChatlog)
				{
					html.addClass("hardHide");
					html.addClass("hard-hide");
					html.removeClass("hard-show");
				}
			}
		}
	}

	_onChangeSidebarTab(tab) {
		if (tab.id === "chat")
			this.tabs?.activate(this.currentTab);
	}

	static _undoDamage(li) {
		const message = game.messages.get(li.data("messageId"));
		const speaker = message.data.speaker;
		const flags = message.data.flags.damageLog;

		if (!speaker.scene)
		{
			ui.notifications.error(game.i18n.localize("damage-log.error.scene-id-missing"));
			return;
		}

		const scene = game.scenes.get(speaker.scene);
		if (!scene)
		{
			ui.notifications.error(game.i18n.format("damage-log.error.scene-deleted", { scene: speaker.scene }));
			return;
		}

		if (!speaker.token)
		{
			ui.notifications.error(game.i18n.localize("damage-log.error.token-id-missing"));
			return;
		}

		const token = scene.tokens.get(speaker.token);
		if (!token)
		{
			ui.notifications.error(game.i18n.format("damage-log.error.token-deleted", { token: speaker.token }));
			return;
		}

		const modifier = li.hasClass("reverted") ? -1 : 1;
		const actorData = token.actor.data;
		let update = null;
		
		switch (game.system.id)
		{
			case "dnd5e":
			case "D35E":
			case "pf1":
			case "pf2e":
			{
				const currentHp = actorData.data.attributes.hp;
				const maxHp = currentHp.max + (currentHp.tempMax ?? 0);
		
				update = {
					"data.attributes.hp": {
						value: Math.min(maxHp, Math.max(currentHp.value - (flags.value.diff * modifier), 0)),
						temp: Math.max(currentHp.temp - (flags.temp.diff * modifier), 0)
					}
				};
				break;
			}

			case "worldbuilding":
			{
				const currentHp = actorData.data.health;
				update = {
					"data.health.value": Math.min(currentHp.max, Math.max(currentHp.value - (flags.value.diff * modifier), currentHp.min))
				};
				break;
			}

			default:
				return;
		}

		actorData.document.update(update, { damageLog: { isRevert: true } });

		if (modifier === 1)
			li.addClass("reverted");
		else
			li.removeClass("reverted");
	}
}

Hooks.once('init', () => {
	game.damageLog = new DamageLog();
});
