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

	/**
	 * DamageLog constructor.
	 * @constructor
	 */
	constructor() {
		this.settings = new DamageLogSettings();
		this.prevFlags = null;
		this.tabs = null;
		this.currentTab = "chat";
		this.hasTabbedChatlog = !!game.modules.get("tabbed-chatlog")?.active;

		loadTemplates([DamageLog.TABS_TEMPLATE, DamageLog.TABLE_TEMPLATE]);

		Hooks.once('getChatLogEntryContext', this._onGetChatLogEntryContext.bind(this));
		Hooks.on('preUpdateActor', this._onPreUpdateActor.bind(this));
		Hooks.on('updateActor', this._onUpdateActor.bind(this));
		Hooks.on('renderChatMessage', this._onRenderChatMessage.bind(this));
		if (this.settings.useTab)
		{
			Hooks.on("renderChatLog", this._onRenderChatLog.bind(this));
			Hooks.on('changeSidebarTab', this._onChangeSidebarTab.bind(this));
		}
	}

	/**
	 * Handle the "getChatLogEntryContext" hook.
	 * This sets up the right click context menus for chat messages.
	 */
	_onGetChatLogEntryContext(html, options) {
		const canUndo = li => {
			if (game.user.isGM) return true;
			if (!this.settings.allowPlayerUndo) return false;

			const message = game.messages.get(li.data("messageId"));
			const actor = ChatMessage.getSpeakerActor(message?.data?.speaker);
			return actor?.testUserPermission(game.user, CONST.ENTITY_PERMISSIONS.OWNER);
		};

		options.push(
			{
				name: game.i18n.localize("damage-log.undo-damage"),
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => canUndo(li) && li.is(".damage-log.damage:not(.reverted)"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.undo-healing"),
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => canUndo(li) && li.is(".damage-log.healing:not(.reverted)"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.redo-damage"),
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => canUndo(li) && li.is(".damage-log.damage.reverted"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.redo-healing"),
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => canUndo(li) && li.is(".damage-log.healing.reverted"),
				callback: li => DamageLog._undoDamage(li)
			}
		);
	}

	/**
	 * Handle the "renderChatLog" hook.
	 * This creates the separate tab for the damage log.
	 */
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

	/**
	 * Creates the damage log tab when Tabbed Chatlog module is installed.
	 */
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

	/**
	 * Handle the user switching tabs.
	 */
	_onTabSwitch(event, tabs, tab) {
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

	/**
	 * Handle the "preUpdateActor" hook.
	 * Calculate the difference between the old and new HP values for the actor and creates the damage log chat message.
	 */
	async _onPreUpdateActor(actor, updateData, options, userId) {
		if (userId !== game.user.id) return;
		if (options["damage-log"]?.messageId) return;

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

			const chatData = {
				flags: { "damage-log": flags },
				flavor: game.i18n.format((totalDiff < 0 ? "damage-log.damage-flavor-text" : "damage-log.healing-flavor-text"), { diff: Math.abs(totalDiff) }),
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				speaker
			};

			// If limited player view is enabled, send messages to all players (confidential info will get stripped out in _onRenderChatMessage)
			// Otherwise, only send the message to the players who have the correct permissions.
			if (!this.settings.allowPlayerView || !this.settings.showLimitedInfoToPlayers)
				chatData["whisper"] = game.users.contents.filter(user => this._canUserViewActorDamage(user, actor)).map(user => user.id);

			ChatMessage.create(chatData, {});
		}
	}

	/**
	 * Handle the "updateActor" hook.
	 * Only interested in this hook when the user reverts or re-applys damage/healing.
	 * Sets or clears the "reverted" flag in the message.
	 */
	_onUpdateActor(actor, updateData, options, userId) {
		const flags = options["damage-log"];
		if (flags?.messageId)
		{
			const message = game.messages.get(flags.messageId);
			if (!message) return;

			// If the user that created the message is connected, let their client update the message.
			// Otherwise let the GM do it.
			if (message.user.active ? (message.user.id === game.user.id) : game.user.isGM)
			{
				// Changing the message flags will cause the renderChatMessage hook to fire
				if (flags.revert > 0)
					message.setFlag("damage-log", "revert", true);
				else
					message.unsetFlag("damage-log", "revert");
			}
		}
	}

	/**
	 * Handle the "renderChatMessage" hook.
	 * Applies classes to the message's HTML based on the message flags.
	 * Also responsible for hiding messages, depending on which tab is currently showing.
	 */
	async _onRenderChatMessage(message, html, messageData) {
		if (this.settings.useTab && this.hasTabbedChatlog)
		{
			// Force Tabbed Chatlog to render first.
			await new Promise(r => setTimeout(r, 0));
		}

		const hp = message.data?.flags["damage-log"];
		if (!hp) {
			if (this.settings.useTab && (this.currentTab === "damage-log"))
				html.hide();
			return;
		}

		// If the rolls notification wasn't showing before the message was created, then hide it again.
		// TODO - this currently only works for the user that modified the token.
		if (hp.preventRollsNotification)
			$("#rollsNotification").hide();

		// Work out if the user is allowed to see the damage table, and then add it to the HTML.
		let canViewTable = game.user.isGM;
		if (!canViewTable && this.settings.allowPlayerView) {
			const actor = ChatMessage.getSpeakerActor(message.data?.speaker);
			canViewTable = this._canUserViewActorDamage(game.user, actor);
		}

		if (canViewTable)
			html.find("div.message-content").prepend(await renderTemplate(DamageLog.TABLE_TEMPLATE, hp));

		if (hp.revert)
			html.addClass("reverted");
		else
			html.removeClass("reverted");

		html.addClass("damage-log");

		if ((0 !== hp.temp.diff) || (0 !== hp.value.diff))
		{
			if ((hp.temp.diff + hp.value.diff) >= 0)
				html.addClass("healing");
			else
				html.addClass("damage");
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

		// The user shouldn't receive damage messages that they aren't allowed to see.  However if the settings change, then there will be
		// messages in the log that we no longer have permissions for, so we should hide them.
		if (!canViewTable && !this.settings.showLimitedInfoToPlayers)
			html.addClass("super-hard-hide");
	}

	/**
	 * Handle the "changeSidebarTab" hook.
	 * When switching to Foundry's "chat" tab, make sure the damage-log's current tab is marked as active.
	 */
	_onChangeSidebarTab(tab) {
		if (tab.id === "chat")
			this.tabs?.activate(this.currentTab);
	}

	/**
	 * Check whether a user has permission to see a given actor's damage info or not.
	 */
	_canUserViewActorDamage(user, actor) {
		if (user.isGM) return true;
		if (!this.settings.allowPlayerView) return false;
 
		return actor?.testUserPermission(user, this.settings.minPlayerPermission);
	};

	/**
	 * Undo the the damage on a given message.
	 */
	static _undoDamage(li) {
		const message = game.messages.get(li.data("messageId"));
		const speaker = message.data.speaker;
		const flags = message.data.flags["damage-log"];

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
				const minHp = currentHp.min ?? 0;

				update = {
					"data.attributes.hp": {
						value: Math.min(maxHp, Math.max(currentHp.value - (flags.value.diff * modifier), minHp)),
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

		actorData.document.update(update, { "damage-log": { revert: modifier, messageId: message.id } });
	}
}

/**
 * Initialization.  Create the DamageLog.
 */
Hooks.once("init", () => {
	game.damageLog = new DamageLog();
});

/**
 * Ready handling.  Convert damage log messages from to new flag format.
 */
Hooks.once("ready", async () => {
	if (game.user.isGM && (game.damageLog.settings.dbVersion < 1))
	{
		console.log("Damage Log | Updating message database");

		let haveNotified = false;
		for (const message of game.messages) {
			const oldFlags = message.data?.flags?.damageLog;
			if (oldFlags) {
				if (!haveNotified) {
					ui.notifications.warn("Damage Log | Updating message database, please do not close the game", { permanent: true });
					haveNotified = true;
				}
				console.log(`Damage Log | Updating flags for message ${message.id}`);
				await message.update({
					"flags.damage-log": oldFlags,
					"flags.-=damageLog": null,
					"content": null
				});
			}
		}

		game.damageLog.settings.dbVersion = 1;

		console.log("Damage Log | Finished updating message database");
		if (haveNotified)
			ui.notifications.info("Damage Log | Finished updating message database", { permanent: true });
	}
});
