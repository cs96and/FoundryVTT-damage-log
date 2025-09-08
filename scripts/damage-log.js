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

import { DamageLogMigration } from "./migration.js";
import { DamageLogSettings } from "./settings.js";
import { Systems } from "./systems.js";
import { Util } from "./util.js"

// Initialization.  Create the DamageLog.
let globalDamageLog;
Hooks.once("setup", () => globalDamageLog = new DamageLog());

class DamageLog {

	static #TABS_TEMPLATE = "modules/damage-log/templates/damage-log-tabs.hbs";
	static #TABLE_TEMPLATE = "modules/damage-log/templates/damage-log-table.hbs";

	/**
	 * DamageLog constructor.
	 * @constructor
	 */
	constructor() {
		this.settings = new DamageLogSettings();
		this.systemConfig = Systems.CONFIGS[game.system.id];
		this.tabs = null;
		this.scrollTarget = null;
		this.currentTab = "chat";
		this.hasPf2eDorakoUi = !!game.modules.get("pf2e-dorako-ui")?.active;
		this.damageType = "";
		this.prevScrollTop = 0;
		this.isCreatingDamageLogMessage = 0;

		if (!this.systemConfig) {
			Hooks.once("ready", () => ui.notifications.error(game.i18n.format("damage-log.error.system-not-supported", { systemId: game.system.id })));
			throw false;
		}

		Util.loadTemplates([DamageLog.#TABS_TEMPLATE, DamageLog.#TABLE_TEMPLATE]);

		if (this.settings.useTab)
		{
			Hooks.on("renderChatLog", this.#onRenderChatLog.bind(this));
			Hooks.on('changeSidebarTab', this.#onChangeSidebarTab.bind(this));
			Hooks.on("collapseSidebar", this.#onCollapseSidebar.bind(this));
		}

		if (Util.isV13())
			Hooks.on('getChatMessageContextOptions', this.#getChatMessageContextOptions.bind(this));
		else
			Hooks.on('getChatLogEntryContext', this.#getChatMessageContextOptions.bind(this));

		Hooks.on('preUpdateActor', this.#onPreUpdateActor.bind(this));
		Hooks.on('updateActor', this.#onUpdateActor.bind(this));
		Hooks.on('preUpdateChatMessage', this.#onPreUpdateChatMessage.bind(this));
		Hooks.on(Util.isV13() ? 'renderChatMessageHTML' : 'renderChatMessage', this.#onRenderChatMessage.bind(this));

		if (game.modules.get('lib-wrapper')?.active) {
			libWrapper.register('damage-log', `${Util.chatLogClassPath}.prototype.notify`, this.#onChatLogNotify, 'MIXED');
			libWrapper.register('damage-log', `${Util.chatLogClassPath}.prototype.updateTimestamps`, this.#onUpdateTimestamps, 'WRAPPER');
			libWrapper.register('damage-log', `${Util.chatLogClassPath}.prototype.scrollBottom`, this.#onScrollBottom, 'MIXED');

			libWrapper.ignore_conflicts('damage-log', ['actually-private-rolls', 'hide-gm-rolls', 'monks-little-details'], `${Util.chatLogClassPath}.prototype.notify`);
			libWrapper.ignore_conflicts('damage-log', ['koboldworks-pf1-little-helper'], `${Util.chatLogClassPath}.prototype.scrollBottom`);
		}

		// Ready handling. Convert damage log messages flag to new format.
		Hooks.once("ready", async () => {
			if (!game.modules.get('lib-wrapper')?.active && game.user.isGM)
				ui.notifications.error("Damage Log requires the 'libWrapper' module. Please install and activate it.", { permanent: true });

			await DamageLogMigration.migrateFlags(self);
		});

		// If this is dnd5e 3.0.0 or greater, copy the styles for #chat-log to #damage-log
		if ((game.system.id === "dnd5e") && !foundry.utils.isNewerVersion("3.0.0", game.system.version)) {
			let damageLogStyleSheet = new CSSStyleSheet()
			for (const sheet of document.styleSheets) {
				let dnd5eStyleSheet = null;
				if (sheet.href?.endsWith("dnd5e.css")) {
					dnd5eStyleSheet = sheet;
				} else for (const innerRule of sheet.cssRules) {
					if (innerRule.styleSheet?.href?.endsWith("dnd5e.css")) {
						dnd5eStyleSheet = innerRule.styleSheet;
						break;
					}
				}

				if (dnd5eStyleSheet) {
					for (const rule of dnd5eStyleSheet.cssRules) {
						if ((rule instanceof CSSStyleRule) && rule.selectorText?.includes(Util.chatLogSelector)) {
							let newRule = rule.cssText.replaceAll(Util.chatLogSelector, "#damage-log");
							if (Util.isV13()) {
								newRule = newRule.replaceAll(/#chat-log,?/g, "");
							}
							damageLogStyleSheet.insertRule(newRule, damageLogStyleSheet.cssRules.length);
						}
					}
					document.adoptedStyleSheets.push(damageLogStyleSheet);
					break;
				}
			}
		}
	}

	/**
	 * Handle the "renderChatLog" hook.
	 * This creates the separate tab for the damage log.
	 * It also sets up a mutation observer to move any damage messages to the damage log tab.
	 */
	async #onRenderChatLog(chatTab, html, user) {
		if (!game.user.isGM && !this.settings.allowPlayerView) return;

		const element = Util.isV13() ? html : html[0];

		const tabsHtml = await Util.renderTemplate(DamageLog.#TABS_TEMPLATE);
		element.insertAdjacentHTML("afterBegin", tabsHtml);

		const TabsClass = Util.isV13() ? foundry.applications.ux.Tabs : Tabs;
		const tabs = new TabsClass({
			navSelector: ".damage-log-nav.tabs",
			contentSelector: undefined,
			initial: this.currentTab,
			callback: (event, tabs, tab) => this.#onTabSwitch(event, tabs, tab, chatTab)
		});
		tabs.bind(element);

		if (!chatTab.popOut)
			this.tabs = tabs;

		const chatLogElement = element.querySelector(Util.chatLogSelector);
		chatLogElement.insertAdjacentHTML("afterEnd", '<ol id="damage-log"></ol>');

		// Move all the damage log messages into the damage log tab.
		const damageLogElement = element.querySelector("#damage-log");
		const damageMessages = chatLogElement.querySelectorAll(".message.damage-log");
		damageLogElement.append(...damageMessages);
		damageMessages.forEach(m => m.classList.contains("not-permitted") && m.remove());

		this.#onTabSwitch(undefined, undefined, this.currentTab, chatTab);

		// Handle scrolling the damage log
		this.scrollTarget = Util.isV13() ? damageLogElement.parentElement : damageLogElement;
		if (!Util.isV13())
			this.scrollTarget.addEventListener("scroll", this.#onScroll.bind(this));

		// Listen for items being added to the chat log.  If they are damage messages, move them to the damage log tab.
		const observer = new MutationObserver((mutationList, observer) => {
			for (const mutation of mutationList) {
				if (0 === mutation.addedNodes.length) continue;

				// Check if the messages are being added to the top or bottom of the chat log
				const firstChatLogMessageId = chatLogElement.querySelector("li")?.getAttribute("data-message-id");
				const firstAppendedMessageId = mutation.addedNodes[0]?.getAttribute("data-message-id");
				const shouldPrepend = (firstAppendedMessageId === firstChatLogMessageId);

				const nodes = [...mutation.addedNodes].filter(n => {
					if (n.classList.contains("not-permitted"))
						n.remove();
					else if (n.classList.contains("damage-log"))
						return true;
					return false;
				});

				if (0 !== nodes.length) {
					if (shouldPrepend) {
						damageLogElement.prepend(...nodes);
					}
					else {
						damageLogElement.append(...nodes);
						damageLogElement.scrollTo({ top: damageLogElement.scrollHeight, behavior: "smooth" });
					}
				}
			}
		});

		observer.observe(chatLogElement, { childList: true });
	}

	/**
	 * Handle the user switching tabs.
	 */
	async #onTabSwitch(event, tabs, tab, chatTab) {
		if (!chatTab.popOut)
			this.currentTab = tab;

		const element = Util.isV13() ? chatTab.element : chatTab.element[0];
		const chatLog = element.querySelector(Util.chatLogSelector);
		const damageLog = element.querySelector("#damage-log");

		if (tab === "damage-log") {
			chatLog.style.display = "none";
			damageLog.style.display = "";
		}
		else
		{
			damageLog.style.display = "none";
			chatLog.style.display = "";
		}

		await chatTab.scrollBottom();

		if (tab === "damage-log") {
			if (null != this.scrollTarget?.scrollTop)
				this.prevScrollTop = this.scrollTarget.scrollTop;

			if (!Util.isV13()) {
				// Hide the "jump to bottom" notice if it was showing.
				const jumpToBottom = damageLog.parentElement.querySelector(".jump-to-bottom");
				jumpToBottom.classList.add("hidden");
			}
		}
	}

	/**
	 *	Disable the chat notification on damage log messages.
	 */
	#onChatLogNotify(wrapper, message, ...args) {
		if (message?.flags["damage-log"])
			return;

		return wrapper(message, ...args);
	}

	/**
	 * Override the ChatLog.scrollBottom() function to skip over hidden messages.
	 */
	async #onScrollBottom(wrapper, options={}) {
		// Work out whether chat or damage log is showing.
		// Don't use DamageLog.currentTab, as that only tracks the main chatlog, not the popout.
		const element = Util.isV13() ? this.element : this.element[0];
		const chatLog = element.querySelector(Util.chatLogSelector);
		const damageLog = element.querySelector("#damage-log");
		const log = chatLog.style.display === "" ? chatLog : (damageLog.style.display === "" ? damageLog : null);
		if (!log) return;

		// Prevent scrolling to the bottom if we are creating a damage log message and the damage-log is not showing
		if (globalDamageLog.isCreatingDamageLogMessage > 0) {
			globalDamageLog.isCreatingDamageLogMessage -= 1;
			if (log.id !== "damage-log")
				return;
		}

		if (Util.isV13())
			return wrapper(options);

		const {popout=false, waitImages=false, scrollOptions={}} = options;

		if ( !this.rendered ) return;
		if ( waitImages ) await this._waitForImages();

		log.scrollTop = log.scrollHeight;
		if ( popout ) this._popout?.scrollBottom({waitImages, scrollOptions});
	}

	/**
	 *	Handle updating the timestamps on damage log messages.
	 */
	#onUpdateTimestamps(wrapper, ...args) {
		wrapper(...args);

		// "this" will be a ChatLog here
		const element = Util.isV13() ? this.element : this.element[0];
		if (!element) return;

		const messages = element.querySelectorAll(".damage-log.message");
		for (const li of messages) {
			const message = game.messages.get(li.dataset["messageId"]);
			if (!message || !message.timestamp) continue;

			const stamp = li.querySelector('.message-timestamp');
			stamp.textContent = foundry.utils.timeSince(message.timestamp);
		}
	}

	/**
	 * Handle scrolling to top of the damage log.  If the scrollbar reaches the top, load more messages.
	 */
	async #onScroll(event) {
		const element = event.currentTarget;

		// Only try to load more messages if we are scrolling upwards
		if ((0 === element.scrollTop) && (element.scrollTop < this.prevScrollTop)) {
			const scrollBottom = element.scrollHeight;
			await ui.chat._renderBatch(ui.chat.element, CONFIG.ChatMessage.batchSize);
			element.scrollTop = element.scrollHeight - scrollBottom;
		}

		this.prevScrollTop = element.scrollTop;
	}

	/**
	 * Handle the "changeSidebarTab" hook.
	 * When switching to Foundry's "chat" tab, make sure the damage-log's current tab is marked as active.
	 */
	#onChangeSidebarTab(tab) {
		if (tab.id === "chat")
			this.tabs?.activate(this.currentTab);
	}

	/**
	 * Handle the sidebar collapsing / being revealed.
	 * When the sidebar is revealed and the current tab is the damage log, scroll to the end of the log
	 * For some reason this doesn't work unless we wait at least 250ms first.
	 */
	#onCollapseSidebar(sidebar, isCollapsing) {
		if (!isCollapsing && ("damage-log" === this.currentTab)) {
			const element = Util.isV13() ? sidebar.element : sidebar.element[0];
			const damageLog = element.querySelector("#damage-log");
			if (Util.isV13())
				ui.chat.scrollBottom();
			else
				setTimeout(() => damageLog.scrollTop = damageLog.scrollHeight, 250);
		}
	}

	/**
	 * Handle the "getChatMessageContextOptions" (>= v13) or "getChatLogEntryContext" (< v13) hook.
	 * This sets up the right-click context menus for chat messages.
	 */
	#getChatMessageContextOptions(html, options) {
		const getElement = elem => Util.isV13() ? elem : elem[0];
		const getMessage = li => game.messages.get(getElement(li).dataset["messageId"]);

		const resetVisibility = {
			name: "damage-log.reset-visibility",
			icon: '<i class="fad fa-glasses"></i>',
			condition: (li) => {
				if (!game.user.isGM) return false;

				const message = getMessage(li);
				return (typeof(message?.getFlag("damage-log", "public")) === "boolean");
			},
			callback: li => this.#resetVisibility(getElement(li))
		};

		// Put the Reset Visibility menu item after the Reveal/Conceal options
		let index = options.findIndex(o => o.name === "CHAT.ConcealMessage");
		if (index >= 0) ++index;
		options.splice(index, 0, resetVisibility);

		const canUndo = (li) => {
			if (game.user.isGM) return true;
			if (!this.settings.allowPlayerUndo) return false;

			const message = getMessage(li);
			const actor = ChatMessage.getSpeakerActor(message?.speaker);
			return actor?.testUserPermission(game.user, Util.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
		};

		options.push(
			{
				name: "damage-log.undo-damage",
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => canUndo(li) && getElement(li).matches(".damage-log.damage:not(.reverted)"),
				callback: li => this.#undoDamage(getElement(li))
			},
			{
				name: "damage-log.undo-healing",
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => canUndo(li) && getElement(li).matches(".damage-log.healing:not(.reverted)"),
				callback: li => this.#undoDamage(getElement(li))
			},
			{
				name: "damage-log.redo-damage",
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => canUndo(li) && getElement(li).matches(".damage-log.damage.reverted"),
				callback: li => this.#undoDamage(getElement(li))
			},
			{
				name: "damage-log.redo-healing",
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => canUndo(li) && getElement(li).matches(".damage-log.healing.reverted"),
				callback: li => this.#undoDamage(getElement(li))
			}
		);
	}

	/**
	 * Handle the "preUpdateActor" hook.
	 * Calculate the difference between the old and new HP values for the actor and creates the damage log chat message.
	 */
	async #onPreUpdateActor(actor, updateData, options, userId) {
		if (userId !== game.user.id) return;
		if (options["damage-log"]?.messageId) return;

		const speaker = ChatMessage.getSpeaker({ actor, token: actor.token });

		// Get a nested property of an object using a string.
		const getAttrib = (obj, path) => {
			return path && path.split('.').reduce((prev, curr) => prev && prev[curr], obj);
		}

		const flags = {};

		for (const [ id, config ] of Object.entries(this.systemConfig)) {
			let localizationId = `damage-log.${game.system.id}.${id}-name`;
			if (!game.i18n.has(localizationId))
				localizationId = `damage-log.default.${id}-name`;
			const name = (game.i18n.has(localizationId) ? game.i18n.localize(localizationId) : id);

			const oldValue = getAttrib(actor.system, config.value) ?? 0;

			let newValue;
			if ("offset" in config) {
				const offset = getAttrib(updateData.system, config.offset);
				if (offset != null)
					newValue = getAttrib(actor.system, config.max) + offset;
			}

			if (null == newValue)
				newValue = getAttrib(updateData.system, config.value) ?? oldValue;

			const diff = newValue - oldValue;

			if (0 != diff) {
				flags.changes ??= [];
				flags.changes.push({ id, name, old: oldValue, new: newValue, diff });
			}
		}

		if (foundry.utils.isEmpty(flags)) return;

		const { isHealing, totalDiff } = this.#analyseFlags(flags);

		const flavorOptions = {
			diff: Math.abs(totalDiff),
			damageType: this.damageType
		};

		const content = flags.changes.reduce((prev, curr) => {
			return prev + `${curr.id}: ${curr.old} -&gt; ${curr.new} `
		}, '');

		const chatData = {
			flags: { "damage-log": flags },
			[Util.chatStyleKeyName]: Util.CHAT_MESSAGE_STYLES.OTHER,
			flavor: game.i18n.format((isHealing ? "damage-log.healing-flavor-text" : "damage-log.damage-flavor-text"), flavorOptions),
			content,
			speaker,
			whisper: this.#calculteWhisperData(actor, isHealing)
		};

		const nMessages = (document.getElementById("chat-popout") ? 2 : 1);
		this.isCreatingDamageLogMessage += nMessages;

		// isCreatingDamageLogMessage should get decremented in #onScrollBottom, but reset it after 500ms in case that
		// callback doesn't happen for some reason.
		setTimeout(() => {
			if (this.isCreatingDamageLogMessage > 0)
				this.isCreatingDamageLogMessage -= Math.min(nMessages, this.isCreatingDamageLogMessage);
		}, 500);

		ChatMessage.create(chatData, {});
	}

	/**
	 * Handle the "updateActor" hook.
	 * Only interested in this hook when the user reverts or re-applys damage/healing.
	 * Sets or clears the "reverted" flag in the message.
	 */
	#onUpdateActor(actor, updateData, options, userId) {
		const flags = options["damage-log"];
		if (flags?.messageId)
		{
			const message = game.messages.get(flags.messageId);
			if (!message) return;

			// If the user that created the message is connected, let their client update the message.
			// Otherwise let the GM do it.
			if (Util.getMessageAuthor(message).active ? (Util.getMessageAuthor(message).id === game.user.id) : game.user.isGM)
			{
				// Changing the message flags will cause the renderChatMessage hook to fire
				if (flags.revert)
					message.setFlag("damage-log", "revert", true);
				else
					message.unsetFlag("damage-log", "revert");
			}
		}
	}

	/**
	 * 	Handle a Damage Log chat message being made public or private.
	 */
	#onPreUpdateChatMessage(message, changes, options, userId) {
		if (("whisper" in changes) && message?.flags["damage-log"]) {
			// Damage Log message is being made private or public

			// Don't alter the public flag if it is being removed.
			if (changes.flags?.["damage-log"]?.["-=public"] !== null) {
				const isPublic = ((null == changes.whisper) || (0 === changes.whisper.length));
				changes["flags.damage-log.public"] = isPublic;
			}
		}
	}

	/**
	 * Handle the "renderChatMessage" hook.
	 * Applies classes to the message's HTML based on the message flags.
	 */
	async #onRenderChatMessage(message, html, data) {
		const flags = message?.flags["damage-log"];
		if (!flags) return;

		const element = Util.isV13() ? html : html[0];
		const classList = element.classList;

		classList.add("damage-log");

		if (flags.revert)
			classList.add("reverted");
		else
			classList.remove("reverted");

		const isHealing = this.#analyseFlags(flags).isHealing;
		if (isHealing)
			classList.add("healing");
		else
			classList.add("damage");

		// Work out if the user is allowed to see the damage table, and then add it to the HTML.
		let canViewTable = game.user.isGM || !!flags.public
		if (!canViewTable && this.settings.allowPlayerView) {
			const actor = ChatMessage.getSpeakerActor(message?.speaker);
			canViewTable = this.#canUserViewActorDamage(game.user, actor);
		}

		if (!canViewTable && (!this.settings.showLimitedInfoToPlayers || (isHealing && this.settings.hideHealingInLimitedInfo)))
			classList.add("not-permitted");

		const content = element.querySelector("div.message-content");

		// Dorako UI moves the flavor text into the message content.  Extract it so we don't overwrite it with the table.
		const flavorText = (this.hasPf2eDorakoUi) ? content.querySelector("span.flavor-text")?.outerHTML ?? "" : "";

		// The current content is just some placeholder text.  Completely replace it with the HTML table, or nothing if the user is not allowed to see it.
		content.innerHTML = flavorText + (canViewTable ? await Util.renderTemplate(DamageLog.#TABLE_TEMPLATE, flags) : "");
	}

	/**
	 * Calculate the array of users who can see a given actor's damage info.
	 */
	#calculteWhisperData(actor, isHealing) {
		// If limited player view is enabled, send messages to all players (confidential info will get stripped out in #onRenderChatMessage)
		// Otherwise, only send the message to the players who have the correct permissions.
		if (!this.settings.allowPlayerView || (!this.settings.showLimitedInfoToPlayers || (isHealing && this.settings.hideHealingInLimitedInfo)))
			return game.users.contents.filter(user => this.#canUserViewActorDamage(user, actor)).map(user => user.id);

		return [];
	}

	/**
	 * Check whether a user has permission to see a given actor's damage info or not.
	 */
	#canUserViewActorDamage(user, actor) {
		if (user.isGM) return true;
		if (!this.settings.allowPlayerView) return false;

		return actor?.testUserPermission(user, this.settings.minPlayerPermission);
	};

	/**
	 * Reset the visibility of a damage-log message back to its default.
	 */
	#resetVisibility(li) {
		const message = game.messages.get(li.dataset["messageId"]);
		const flags = message.flags?.["damage-log"];

		const actor = game.actors.get(message.speaker.actor);
		const isHealing = flags && this.#analyseFlags(flags).isHealing;

		message.update({
			whisper: this.#calculteWhisperData(actor, isHealing),
			"flags.damage-log": { "-=public": null }
		});
	}

	/**
	 * Undo the the damage on a given message.
	 */
	#undoDamage(li) {
		const message = game.messages.get(li.dataset["messageId"]);
		const speaker = message.speaker;
		const flags = message.flags["damage-log"];

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

		const modifier = li.classList.contains("reverted") ? -1 : 1;

		// Check the user that created the message is connected, or there is a GM is connected.
		if (!Util.getMessageAuthor(message).active) {
			const activGMs = game.users.filter(u => u.isGM && u.active);
			if (!activGMs || (0 === activGMs.length)) {
				const messageFlags = {
					undo: ((modifier > 0) ? "undo" : "redo"),
					damage: li.classList.contains("healing") ? "healing" : "damage",
					user: Util.getMessageAuthor(message).name
				};
				ui.notifications.error(game.i18n.format("damage-log.error.no-undo-user", messageFlags));
			}
		}

		// Get a nested property of actorData.data using a string.
		const getActorAttrib = (path) => {
			return path && path.split('.').reduce((prev, curr) => prev && prev[curr], token.actor.system);
		}

		const update = {};

		for (const change of flags.changes) {
			const config = this.systemConfig[change.id];
			if (!config) continue;

			let newValue = getActorAttrib(config.value) - (change.diff * modifier);

			if (this.settings.clampToMin) {
				const min = getActorAttrib(config.min) ?? 0;
				newValue = Math.max(newValue, min);
			}

			if (this.settings.clampToMax && config.max) {
				const max = getActorAttrib(config.max) + (getActorAttrib(config.tempMax) ?? 0);
				newValue = Math.min(newValue, max);
			}

			update[`system.${config.value}`] = newValue;
		}

		token.actor.update(update, { "damage-log": { revert: modifier > 0, messageId: message.id } });
	}

	/**
	 * Returns an object containing data about the healing/damage in the flags.
	 */
	#analyseFlags(flags) {
		// Sum up all the diffs in the changes section of the flags.
		// If the "invert" paramater is true, subtract the diff rather than adding.
		const totalDiff = flags.changes.reduce((prev, curr) => {
			if (this.systemConfig[curr.id]?.invert === true)
				return prev - curr.diff;
			else
				return prev + curr.diff;
		}, 0);

		return { isHealing: totalDiff > 0, totalDiff } ;
	}
}

