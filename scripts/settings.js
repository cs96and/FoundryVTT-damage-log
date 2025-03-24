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

import { Util } from "./util.js"

export class DamageLogSettings {

	/**
	 * DamageLogSettings constructor.
	 * Registers Damage Log's settings with Foundry.
	 * @constructor
	 */
	constructor() {

		Hooks.on("renderSettingsConfig", this.#onRenderSettingsConfig.bind(this));

		game.settings.register("damage-log", "useTab", {
			name: game.i18n.localize("damage-log.settings.use-tab"),
			hint: game.i18n.localize("damage-log.settings.use-tab-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: true,
			requiresReload: true
		});

		game.settings.register("damage-log", "allowPlayerView", {
			name: game.i18n.localize("damage-log.settings.allow-player-view"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false,
			requiresReload: true
		});

		const permissionChoices = {};
		permissionChoices[Util.DOCUMENT_OWNERSHIP_LEVELS.NONE] = game.i18n.localize("damage-log.settings.none");
		permissionChoices[Util.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED] = game.i18n.localize("damage-log.settings.limited");
		permissionChoices[Util.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER] = game.i18n.localize("damage-log.settings.observer");
		permissionChoices[Util.DOCUMENT_OWNERSHIP_LEVELS?.OWNER] = game.i18n.localize("damage-log.settings.owner");

		game.settings.register("damage-log", "minPlayerPermission", {
			name: game.i18n.localize("damage-log.settings.min-player-permission"),
			hint: game.i18n.localize("damage-log.settings.min-player-permission-hint"),
			scope: 'world',
			config: true,
			type: Number,
			choices: permissionChoices,
			default: Util.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
			requiresReload: true
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
			requiresReload: true
		});

		game.settings.register("damage-log", "hideHealingInLimitedInfo", {
			name: game.i18n.localize("damage-log.settings.hide-healing-in-limited-info"),
			hint: game.i18n.localize("damage-log.settings.hide-healing-in-limited-info-hint"),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false,
			requiresReload: true
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
	#onRenderSettingsConfig(settingsConfig, html, user) {
		if (!game.user.isGM) return;

		const element = Util.isV13() ? html : html[0];
		const formGroups = element.querySelectorAll('div.form-group');

		// Disable the player-centric controls if allowPlayerView is disabled.
		const playerSpecificDivs = [...formGroups].filter(fg => {
			return !!fg.querySelector('select[name="damage-log.minPlayerPermission"],input[name="damage-log.allowPlayerUndo"],input[name="damage-log.showLimitedInfoToPlayers"]');
		});
		DamageLogSettings.#toggleDivs(playerSpecificDivs, this.allowPlayerView);

		// Disable "Hide healing in the limited damage info", if "Show limited damage info to players" is disabled.
		const hideHealingDiv = [...formGroups].filter(fg => {
			return !!fg.querySelector('input[name="damage-log.hideHealingInLimitedInfo"]');
		});
		DamageLogSettings.#toggleDivs(hideHealingDiv, this.allowPlayerView && this.showLimitedInfoToPlayers);
		
		const allowPlayersCheckbox = element.querySelector('input[name="damage-log.allowPlayerView"]');
		const showLimitedInfoCheckbox = element.querySelector('input[name="damage-log.showLimitedInfoToPlayers"]');

		// Handle the allowPlayerView checkbox being toggled.
		allowPlayersCheckbox.addEventListener("change", (event) => {
			DamageLogSettings.#toggleDivs(playerSpecificDivs, allowPlayersCheckbox.checked);
			DamageLogSettings.#toggleDivs(hideHealingDiv, allowPlayersCheckbox.checked && showLimitedInfoCheckbox.checked);
		});

		// Handle the showLimitedInfoToPlayers checkbox being toggled.
		showLimitedInfoCheckbox.addEventListener("change", (event) => {
			DamageLogSettings.#toggleDivs(hideHealingDiv, allowPlayersCheckbox.checked && showLimitedInfoCheckbox.checked);
		});
	}

	/**
	 * Enable / disable inputs in a set of divs.
	 */
	static #toggleDivs(divs, enabled) {
		for (const div of divs) {
			// Disable all inputs in the divs (checkboxes and dropdowns)
			div.querySelectorAll("input,select").forEach(i => i.disabled = !enabled);
			// Disable TidyUI's on click events for the labels.
			div.querySelectorAll("label>span").forEach(l => l.style.pointerEvents = (enabled ? "auto" : "none"));
		}
	}
}
