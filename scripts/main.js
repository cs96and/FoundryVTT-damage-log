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

	static TABLE_TEMPLATE = "modules/damage-log/templates/damage-log-table.hbs";

	constructor() {
		this.prevFlags = null;
		loadTemplates([DamageLog.TABLE_TEMPLATE]);

		Hooks.once('getChatLogEntryContext', DamageLog._onGetChatLogEntryContext);
		Hooks.on('preUpdateActor', this._onPreUpdateActor.bind(this));
		Hooks.on('renderChatMessage', DamageLog._onRenderChatMessage);
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

	async _onPreUpdateActor(actor, actorData, options, userId) {
		if (!game.user.isGM) return;
		if (options.damageLog?.isRevert) return;
		if (!actor.isToken && !actor.data.token.actorLink) return;

		const hpData = actorData.data?.attributes?.hp;
		if (!hpData) return;

		const actorHp = actor.data.data.attributes.hp;

		const oldTemp = actorHp.temp ?? 0;
		const newTemp = hpData.temp ?? oldTemp;
		const tempDiff = newTemp - oldTemp;

		const oldValue = actorHp.value ?? 0;
		const newValue = hpData.value ?? oldValue;
		const valueDiff = newValue - oldValue;

		if ((0 === tempDiff) && (0 === valueDiff)) return;

		const flags = {
			speaker: ChatMessage.getSpeaker({ actor }),
			temp: { old: oldTemp, new: newTemp, diff: tempDiff },
			value: { old: oldValue, new: newValue, diff: valueDiff }
		};

		const message = await renderTemplate(DamageLog.TABLE_TEMPLATE, flags);

		// There is a bug in Foundry 0.8.8 that causes preUpdateActor to fire multiple times.
		// Ignore duplicate updates.
		const stringifiedFlags = JSON.stringify(flags);
		if (stringifiedFlags !== this.prevFlags)
		{
			this.prevFlags = stringifiedFlags;

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

	static _onRenderChatMessage(chatMessage, html, messageData) {
		const hp = messageData.message?.flags?.damageLog;
		if (!hp) return;

		html[0].classList.add('damage-log');

		if ((0 !== hp.temp.diff) || (0 !== hp.value.diff))
		{
			if ((hp.temp.diff <= 0) && (hp.value.diff <= 0))
				html[0].classList.add('damage');
			else if ((hp.temp.diff >= 0) && (hp.value.diff >= 0))
				html[0].classList.add('healing');
		}
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
		const currentHp = actorData.data.attributes.hp;
		const maxHp = currentHp.max + (currentHp.tempMax ?? 0);

		const update = {
			"data.attributes.hp": {
				value: Math.min(maxHp, Math.max(currentHp.value - (flags.value.diff * modifier), 0)),
				temp: Math.max(currentHp.temp - (flags.temp.diff * modifier), 0)
			}
		};

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
