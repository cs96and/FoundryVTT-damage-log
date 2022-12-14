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

import { Util } from "./util.js";

export class DamageLogMigration {
	/**
	 * Convert damage log messages flag to new format.
	 */
	static async migrateFlags() {
		if (game.user.isGM && (game.damageLog.settings.dbVersion < 2)) {
			ui.notifications.warn("Damage Log | Updating message database, please do not close the game", { permanent: true });

			if (game.user.isGM && (game.damageLog.settings.dbVersion < 1))
			{
				// Convert from v0 -> v1
				console.log("Damage Log | Updating message database to v1");
				let haveNotified = false
				for (const message of game.messages) {
					const oldFlags = Util.getDocumentData(message)?.flags?.damageLog;
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
				console.log("Damage Log | Finished updating message database to v1");
			}

			// Convert from v1 -> v2
			console.log("Damage Log | Updating message database to v2");
			for (const message of game.messages) {
				const oldFlags = Util.getDocumentData(message)?.flags?.["damage-log"];
				if (oldFlags) {
					console.log(`Damage Log | Updating flags for message ${message.id}`);

					const newFlags = deepClone(oldFlags);
					delete newFlags.value;
					delete newFlags.temp;

					const newHp = deepClone(oldFlags.value);
					if (game.system === "age-of-sigmar-soulbound")
						newHp.id = "toughness";
					else if (game.system === "swade")
						newHp.id = "wounds";
					else
						newHp.id = "hp";

					const newTemp = deepClone(oldFlags.temp);
					newTemp.id = "temp";

					let localizationId = `damage-log.${game.system.id}.temp-name`;
					if (!game.i18n.has(localizationId))
						localizationId = `damage-log.default.temp-name`;
					newTemp.name = (game.i18n.has(localizationId) ? game.i18n.localize(localizationId) : "Temp");

					newFlags.changes = [ newHp, newTemp ];

					await message.update({
						"flags.damage-log": newFlags,
						"flags.damage-log.-=value": null,
						"flags.damage-log.-=temp": null,
					});
				}
			}

			game.damageLog.settings.dbVersion = 2;
			console.log("Damage Log | Finished updating message database to v2");

			ui.notifications.info("Damage Log | Finished updating message database", { permanent: true });
		}
	}
}
