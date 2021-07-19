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

class DamageLog {

	static TABS_TEMPLATE = "modules/damage-log/templates/damage-log-tabs.hbs";
	static TABLE_TEMPLATE = "modules/damage-log/templates/damage-log-table.hbs";

	constructor() {
		this.prevFlags = null;
		this.tabs = null;
		this.currentTab = "chat";
		loadTemplates([DamageLog.TABS_TEMPLATE, DamageLog.TABLE_TEMPLATE]);

		Hooks.once('getChatLogEntryContext', DamageLog._onGetChatLogEntryContext);
		Hooks.on("renderChatLog", this._onRenderChatLog.bind(this));
		Hooks.on('preUpdateActor', this._onPreUpdateActor.bind(this));
		Hooks.on('renderChatMessage', this._onRenderChatMessage.bind(this));
	}

	static _onGetChatLogEntryContext(html, options) {
		options.push(
			{
				name: game.i18n.localize("damage-log.undo-damage"),
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => li.hasClass("damage-log") && !li.hasClass("healing") && !li.hasClass("reverted"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.undo-healing"),
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => li.hasClass("damage-log") && li.hasClass("healing") && !li.hasClass("reverted"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.redo-damage"),
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => li.hasClass("damage-log") && !li.hasClass("healing") && li.hasClass("reverted"),
				callback: li => DamageLog._undoDamage(li)
			},
			{
				name: game.i18n.localize("damage-log.redo-healing"),
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => li.hasClass("damage-log") && li.hasClass("healing") && li.hasClass("reverted"),
				callback: li => DamageLog._undoDamage(li)
			}
		);
	}

	async _onRenderChatLog(chatLog, html, user) {
		const toPrepend = await renderTemplate(DamageLog.TABS_TEMPLATE);
		html.prepend(toPrepend);

		this.tabs = new Tabs({
			navSelector: ".damage-log.tabs",
			contentSelector: undefined,
			initial: this.currentTab,
			callback: this._onTabSwitch.bind(this)
		});
		this.tabs.bind(html[0]);
	}

	_onTabSwitch(event, html, tab) {
		this.currentTab = tab;
		const damageLogMessages = $(".chat-message.message.damage-log");
		const chatMessages = $(".chat-message.message:not(.damage-log)");

		switch (tab)
		{
			case "chat":
				chatMessages.show();
				damageLogMessages.hide();
				break;

			case "damage-log":
				chatMessages.hide();
				damageLogMessages.show();
				break;
		}

		$("#chat-log").scrollTop(9999999);
	}

	async _onPreUpdateActor(actor, updateData, options, userId) {
		if (!game.user.isGM) return;
		if (options.damageLog?.isRevert) return;

		// TODO - getSpeaker should really expect a TokenDocument, but there is currently a bug in Foundry 0.8.8
		// that makes it only accept a Token.  Once 0.8.9 is released, change this to send the TokenDocument instead.
		const speaker = ChatMessage.getSpeaker({ actor, token: actor.token?._object });

		// For "real" (i.e. non-synthetic) actors, make sure there is a linked token in the current scene.
		if (!actor.isToken) {
			const activeTokens = actor.getActiveTokens({linked: true});
			if (!activeTokens.find(i => i.id == speaker.token))
				return;
		}

		let oldTemp = 0, newTemp = 0;
		let oldValue = 0, newValue = 0;
		switch (game.system.id)
		{
			case "dnd5e":
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

			const message = await renderTemplate(DamageLog.TABLE_TEMPLATE, flags);

			const chatData = {
				content: message,
				flags: { damageLog: flags },
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				speaker: flags.speaker,
				whisper: game.users.contents.filter(u => u.isGM).map(u => u.id)
			};

			// No need to keep the speaker data in the flags, because it is also in the chatData.
			// We only kept it in there briefly for the stringify check.
			delete flags.speaker;

			ChatMessage.create(chatData, {});
		}
	}

	_onRenderChatMessage(chatMessage, html, messageData) {
		const hp = messageData.message?.flags?.damageLog;
		if (!hp) {
			if (this.currentTab == "damage-log")
				html.hide();
			return;
		}

		html[0].classList.add('damage-log');

		if ((0 !== hp.temp.diff) || (0 !== hp.value.diff))
		{
			if ((hp.temp.diff <= 0) && (hp.value.diff <= 0))
				html[0].classList.add('damage');
			else if ((hp.temp.diff >= 0) && (hp.value.diff >= 0))
				html[0].classList.add('healing');
		}

		if (this.currentTab != "damage-log")
			html.hide();
	}

	static _undoDamage(li) {
		const message = game.messages.get(li.data("messageId"));
		const speaker = message.data.speaker;
		const flags = message.data.flags.damageLog;

		if (!speaker.scene)
		{
			ui.notifications.error(game.i18n.localize("damage-log.scene-id-missing"));
			return;
		}

		const scene = game.scenes.get(speaker.scene);
		if (!scene)
		{
			ui.notifications.error(game.i18n.format("damage-log.scene-deleted", { scene: speaker.scene }));
			return;
		}

		if (!speaker.token)
		{
			ui.notifications.error(game.i18n.localize("damage-log.token-id-missing"));
			return;
		}

		const token = scene.tokens.get(speaker.token);
		if (!token)
		{
			ui.notifications.error(game.i18n.format("damage-log.token-deleted", { token: speaker.token }));
			return;
		}

		const modifier = li.hasClass("reverted") ? -1 : 1;
		const actorData = token.actor.data;
		let update = null;
		
		switch (game.system.id)
		{
			case "dnd5e":
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

		if (modifier == 1)
			li.addClass("reverted");
		else
			li.removeClass("reverted");
	}
}

Hooks.once('init', () => {
	game.damageLog = new DamageLog();
});
