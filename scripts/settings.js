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

export class DamageLogSettings {

	constructor() {
		game.settings.register("damage-log", "useTab", {
			name: game.i18n.localize("damage-log.settings.use-tab"),
			hint: game.i18n.localize("damage-log.settings.use-tab-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: true,
			onChange: () => window.location.reload()
		});

		this.useTab = game.settings.get("damage-log", "useTab");
	}
}
