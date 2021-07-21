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

		game.settings.register("damage-log", "allowPlayerView", {
			name: game.i18n.localize("damage-log.settings.allow-player-view"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false,
			onChange: () => window.location.reload()
		});

		const permissionChoices = {};
		permissionChoices[CONST.ENTITY_PERMISSIONS.NONE] = game.i18n.localize("damage-log.settings.none");
		permissionChoices[CONST.ENTITY_PERMISSIONS.LIMITED] = game.i18n.localize("damage-log.settings.limited");
		permissionChoices[CONST.ENTITY_PERMISSIONS.OBSERVER] = game.i18n.localize("damage-log.settings.observer");
		permissionChoices[CONST.ENTITY_PERMISSIONS.OWNER] = game.i18n.localize("damage-log.settings.owner");

		game.settings.register("damage-log", "minPlayerPermission", {
			name: game.i18n.localize("damage-log.settings.min-player-permission"),
			hint: game.i18n.localize("damage-log.settings.min-player-permission-hint"),
			scope: 'world',
			config: true,
			type: Number,
			choices: permissionChoices,
			default: CONST.ENTITY_PERMISSIONS.OWNER,
			onChange: () => window.location.reload()
		});

		game.settings.register("damage-log", "allowPlayerUndo", {
			name: game.i18n.localize("damage-log.settings.allow-player-undo"),
			hint: game.i18n.localize("damage-log.settings.allow-player-undo-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false,
			onChange: () => this.allowPlayerUndo = game.settings.get("damage-log", "allowPlayerUndo")
		});

		this.useTab = game.settings.get("damage-log", "useTab");
		this.allowPlayerView = game.settings.get("damage-log", "allowPlayerView");
		this.minPlayerPermission = game.settings.get("damage-log", "minPlayerPermission");
		this.allowPlayerUndo = game.settings.get("damage-log", "allowPlayerUndo");
		let x = 0;
	}
}
