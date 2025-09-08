/*
 * Damage Log
 * https://github.com/cs96and/FoundryVTT-damage-log
 *
 * Copyright (c) 2021-2025 Alan Davies - All Rights Reserved.
 *
 * You may use, distribute and modify this code under the terms of the MIT license.
 *
 * You should have received a copy of the MIT license with this file. If not, please visit:
 * https://mit-license.org/
 */

export class Util {
	static #isV12;
	static #isV13;

	static isV12() {
		Util.#isV12 ??= !foundry.utils.isNewerVersion("12", game.version);
		return Util.#isV12;
	}

	static isV13() {
		Util.#isV13 ??= !foundry.utils.isNewerVersion("13", game.version);
		return Util.#isV13;
	}

	static get CHAT_MESSAGE_STYLES() {
		return (Util.isV12() ? CONST.CHAT_MESSAGE_STYLES : CONST.CHAT_MESSAGE_TYPES);
	}

	static get DOCUMENT_OWNERSHIP_LEVELS() {
		return (Util.isV12() ? CONST.DOCUMENT_OWNERSHIP_LEVELS : CONST.DOCUMENT_PERMISSION_LEVELS);
	}

	static get chatLogClassPath() {
		return Util.isV13() ? "foundry.applications.sidebar.tabs.ChatLog" : "ChatLog";
	}

	static get chatLogSelector() {
		return `${Util.isV13() ? '.' : '#'}chat-log`;
	}

	static get chatStyleKeyName() {
		return (Util.isV12() ? "style" : "type");
	}

	static getMessageStyle(message) {
		return message[Util.chatStyleKeyName];
	}

	static getMessageAuthor(message) {
		return (Util.isV12() ? message.author : message.user);
	}

	static async loadTemplates(...args) {
		return Util.isV13() ? foundry.applications.handlebars.loadTemplates(...args) : loadTemplates(...args)
	}

	static async renderTemplate(...args) {
		return Util.isV13() ? foundry.applications.handlebars.renderTemplate(...args) : renderTemplate(...args)
	}
}
