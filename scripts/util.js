/*
 * Damage Log
 * https://github.com/cs96and/FoundryVTT-damage-log
 *
 * Copyright (c) 2021-2022 Alan Davies - All Rights Reserved.
 *
 * You may use, distribute and modify this code under the terms of the MIT license.
 *
 * You should have received a copy of the MIT license with this file. If not, please visit:
 * https://mit-license.org/
 */

export class Util {
	static _isV10 = null;

    static get isV10() {
		Util._isV10 ??= !isNewerVersion("10", game.version ?? game.data.version);
		return Util._isV10;
	}

	static get PERMISSION_CONSTS() {
		return (Util.isV10 ? CONST.DOCUMENT_PERMISSION_LEVELS : CONST.ENTITY_PERMISSIONS);
	}

	static getDocumentData(document) {
		return (Util.isV10 ? document : document.data);
	}

	static getSystemData(actor) {
		return (Util.isV10 ? actor.system : actor.data.data);
	}

	static isEmpty(obj) {
		return (Util.isV10 ? isEmpty : isObjectEmpty)(obj);
	}

	static isRoll(messageData) {
		return (Util.isV10 ? (messageData.rolls.length > 0) : !!messageData.roll);
	}

	static isTokenHidden(token) {
		return (Util.isV10 ? token?.document?.hidden : token?.data?.hidden);
	}

	static updateMessageData(messageData, ...args) {
		const updateFn = (Util.isV10 ? messageData.updateSource : messageData.update);
		return updateFn.apply(messageData, args);
	}
}
