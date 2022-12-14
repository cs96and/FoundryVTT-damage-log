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

export class DamageLogSettings {

	/**
	 * DamageLogSettings constructor.
	 * Registers Damage Log's settings with Foundry.
	 * @constructor
	 */
	constructor() {

		Hooks.on("renderSettingsConfig", this._onRenderSettingsConfig.bind(this));

		const debouncedReload = debounce(() => window.location.reload(), 500);

		game.settings.register("damage-log", "useTab", {
			name: game.i18n.localize("damage-log.settings.use-tab"),
			hint: game.i18n.localize("damage-log.settings.use-tab-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: true,
			onChange: debouncedReload
		});

		game.settings.register("damage-log", "allowPlayerView", {
			name: game.i18n.localize("damage-log.settings.allow-player-view"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false,
			onChange: debouncedReload
		});

		const permissionChoices = {};
		permissionChoices[Util.PERMISSION_CONSTS.NONE] = game.i18n.localize("damage-log.settings.none");
		permissionChoices[Util.PERMISSION_CONSTS.LIMITED] = game.i18n.localize("damage-log.settings.limited");
		permissionChoices[Util.PERMISSION_CONSTS.OBSERVER] = game.i18n.localize("damage-log.settings.observer");
		permissionChoices[Util.PERMISSION_CONSTS.OWNER] = game.i18n.localize("damage-log.settings.owner");

		game.settings.register("damage-log", "minPlayerPermission", {
			name: game.i18n.localize("damage-log.settings.min-player-permission"),
			hint: game.i18n.localize("damage-log.settings.min-player-permission-hint"),
			scope: 'world',
			config: true,
			type: Number,
			choices: permissionChoices,
			default: Util.PERMISSION_CONSTS.OWNER,
			onChange: debouncedReload
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

		game.settings.register("damage-log", "showLimitedInfoToPlayers", {
			name: game.i18n.localize("damage-log.settings.show-limited-info"),
			hint: game.i18n.localize("damage-log.settings.show-limited-info-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false,
			onChange: debouncedReload
		});

		game.settings.register("damage-log", "hideHealingInLimitedInfo", {
			name: game.i18n.localize("damage-log.settings.hide-healing-in-limited-info"),
			hint: game.i18n.localize("damage-log.settings.hide-healing-in-limited-info-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false,
			onChange: debouncedReload
		});

		game.settings.register("damage-log", "clampToMax", {
			name: game.i18n.localize("damage-log.settings.clamp-to-max"),
			hint: game.i18n.localize("damage-log.settings.clamp-to-max-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: true,
			onChange: () => this.clampToMax = game.settings.get("damage-log", "clampToMax")
		});

		game.settings.register("damage-log", "clampToMin", {
			name: game.i18n.localize("damage-log.settings.clamp-to-min"),
			hint: game.i18n.localize("damage-log.settings.clamp-to-min-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: true,
			onChange: () => this.clampToMin = game.settings.get("damage-log", "clampToMin")
		});

		game.settings.register("damage-log", "dbVersion", {
			scope: 'world',
			config: false,
			type: Number,
			default: 2
		});

		// Cache the settings in class properties for quick lookup.
		this.useTab = game.settings.get("damage-log", "useTab");
		this.allowPlayerView = game.settings.get("damage-log", "allowPlayerView");
		this.minPlayerPermission = game.settings.get("damage-log", "minPlayerPermission");
		this.allowPlayerUndo = game.settings.get("damage-log", "allowPlayerUndo");
		this.showLimitedInfoToPlayers = game.settings.get("damage-log", "showLimitedInfoToPlayers");
		this.hideHealingInLimitedInfo = game.settings.get("damage-log", "hideHealingInLimitedInfo");
		this.clampToMax = game.settings.get("damage-log", "clampToMax");
		this.clampToMin = game.settings.get("damage-log", "clampToMin");
	}

	/**
	 * Get the db version.
	 */
	get dbVersion() {
		return game.settings.get("damage-log", "dbVersion");
	}

	/**
	 * Set the db version.
	 */
	set dbVersion(value) {
		game.settings.set("damage-log", "dbVersion", value);
	}

	/**
	 * Handle the "renderSettingsConfig" hook.
	 * This is fired when Foundry's settings window is opened.
	 * Enable / disable interaction with various settings, depending on whether "Allow Player View" is enabled.
	 */
	_onRenderSettingsConfig(settingsConfig, html, user) {
		if (!game.user.isGM) return;

		const formGroups = html[0].querySelectorAll('div.form-group');

		// Disable the player-centric controls if allowPlayerView is disabled.
		const playerSpecificDivs = [...formGroups].filter(fg => {
			return !!fg.querySelector('select[name="damage-log.minPlayerPermission"],input[name="damage-log.allowPlayerUndo"],input[name="damage-log.showLimitedInfoToPlayers"]');
		});
		DamageLogSettings._toggleDivs(playerSpecificDivs, this.allowPlayerView);

		// Disable "Hide healing in the limited damage info", if "Show limited damage info to players" is disabled.
		const hideHealingDiv = [...formGroups].filter(fg => {
			return !!fg.querySelector('input[name="damage-log.hideHealingInLimitedInfo"]');
		});
		DamageLogSettings._toggleDivs(hideHealingDiv, this.allowPlayerView && this.showLimitedInfoToPlayers);
		
		const allowPlayersCheckbox = html[0].querySelector('input[name="damage-log.allowPlayerView"]');
		const showLimitedInfoCheckbox = html[0].querySelector('input[name="damage-log.showLimitedInfoToPlayers"]');

		// Handle the allowPlayerView checkbox being toggled.
		allowPlayersCheckbox.addEventListener("change", (event) => {
			DamageLogSettings._toggleDivs(playerSpecificDivs, allowPlayersCheckbox.checked);
			DamageLogSettings._toggleDivs(hideHealingDiv, allowPlayersCheckbox.checked && showLimitedInfoCheckbox.checked);
		});

		// Handle the showLimitedInfoToPlayers checkbox being toggled.
		showLimitedInfoCheckbox.addEventListener("change", (event) => {
			DamageLogSettings._toggleDivs(hideHealingDiv, allowPlayersCheckbox.checked && showLimitedInfoCheckbox.checked);
		});
	}

	/**
	 * Enable / disable inputs in a set of divs.
	 */
	static _toggleDivs(divs, enabled) {
		for (const div of divs) {
			// Disable all inputs in the divs (checkboxes and dropdowns)
			div.querySelectorAll("input,select").forEach(i => i.disabled = !enabled);
			// Disable TidyUI's on click events for the labels.
			div.querySelectorAll("label>span").forEach(l => l.style.pointerEvents = (enabled ? "auto" : "none"));
		}
	}
}
