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

import { DamageLogSettings } from "./settings.js";
import { Util } from "./util.js";

class DamageLog {

	/**
	 * Location of HP attributes in D&D-like systems.
	 */
	static DND_ATTRIBUTES = {
		value: "attributes.hp.value",
		min: "attributes.hp.min",
		max: "attributes.hp.max",
		tempMax: "attributes.hp.tempMax",
		temp: "attributes.hp.temp"
	};

	/**
	 * Location of HP attributes for supported systems.
	 */
	static SYSTEMS = {
		dnd5e: DamageLog.DND_ATTRIBUTES,
		D35E: DamageLog.DND_ATTRIBUTES,
		pf1: DamageLog.DND_ATTRIBUTES,
		pf2e: DamageLog.DND_ATTRIBUTES,
		swade: {
			invert: true,
			value: "wounds.value",
			min: "wounds.min",
			max: "wounds.max",
			others: {
				bennies: {
					invert: false,
					value: "bennies.value",
					min: "bennies.min",
					max: "bennies.max"
				},
				fatigue: {
					invert: true,
					value: "fatigue.value",
					min: "fatigue.min",
					max: "fatigue.max"
				},
			}
		},
		worldbuilding: {
			value: "health.value",
			min: "health.min",
			max: "health.max"
		},
		"age-of-sigmar-soulbound": {
			value: "combat.health.toughness.value",
			max: "combat.health.toughness.max"
		}
	};

	static TABS_TEMPLATE = "modules/damage-log/templates/damage-log-tabs.hbs";
	static TABLE_TEMPLATE = "modules/damage-log/templates/damage-log-table.hbs";

	/**
	 * DamageLog constructor.
	 * @constructor
	 */
	constructor() {
		this.settings = new DamageLogSettings();
		this.system = DamageLog.SYSTEMS[game.system.id];
		this.prevFlags = null;
		this.tabs = null;
		this.currentTab = "chat";
		this.hasTabbedChatlog = !!game.modules.get("tabbed-chatlog")?.active;
		this.damageType = "";
		this.prevScrollTop = 0;

		if (!this.system) {
			Hooks.once("ready", () => ui.notifications.error(game.i18n.format("damage-log.error.system-not-supported", { systemId: game.system.id })));
			throw false;
		}

		loadTemplates([DamageLog.TABS_TEMPLATE, DamageLog.TABLE_TEMPLATE]);

		if (this.settings.useTab)
		{
			Hooks.on("renderChatLog", this._onRenderChatLog.bind(this));
			Hooks.on('changeSidebarTab', this._onChangeSidebarTab.bind(this));
			Hooks.on("collapseSidebar", this._onCollapseSidebar.bind(this));
		}
		Hooks.on('getChatLogEntryContext', this._onGetChatLogEntryContext.bind(this));
		Hooks.on('preUpdateActor', this._onPreUpdateActor.bind(this));
		Hooks.on('updateActor', this._onUpdateActor.bind(this));
		Hooks.on('renderChatMessage', this._onRenderChatMessage.bind(this));

		if (game.modules.get('lib-wrapper')?.active) {
			libWrapper.register('damage-log', 'ChatLog.prototype.notify', this._onChatLogNotify, 'MIXED');
			libWrapper.register('damage-log', 'ChatLog.prototype.updateTimestamps', this._onUpdateTimestamps, 'WRAPPER');
			libWrapper.register('damage-log', 'Messages.prototype.flush', this._onMessageLogFlush.bind(this), 'MIXED');

			libWrapper.ignore_conflicts('damage-log', ['actually-private-rolls', 'hide-gm-rolls', 'monks-little-details'], 'ChatLog.prototype.notify');
		}

		// If BetterRolls5e is enabled, wrap the BetterRollsChatCard.applyDamage function
		// to cache the damage type of applied damage.
		if (!!game.modules.get("betterrolls5e")?.active) {
			import("/modules/betterrolls5e/scripts/chat-message.js").then((obj) => {
				const damageLog = this;
				const origBetterRollsApplyDamage = obj.BetterRollsChatCard.prototype.applyDamage;

				obj.BetterRollsChatCard.prototype.applyDamage = async function(actor, damageType, ...rest) {
					// Here, "this" will be a BetterRollsChatCard object.
					try {
						damageLog.damageType = damageType;
						return await origBetterRollsApplyDamage.call(this, actor, damageType, ...rest);
					} finally {
						damageLog.damageType = "";
					}
				};
			})
		}
	}

	/**
	 * Handle the "renderChatLog" hook.
	 * This creates the separate tab for the damage log.
	 * It also sets up a mutation observer to move any damage messages to the damage log tab.
	 */
	async _onRenderChatLog(chatTab, html, user) {
		if (!game.user.isGM && !this.settings.allowPlayerView) return;

		if (this.hasTabbedChatlog) {
			// Force Tabbed Chatlog to render first
			await new Promise(r => {
				this._onTabbedChatlogRenderChatLog(chatTab, html, user);
				this.currentTab = game.tabbedchat.tabs.active;
				r();
			});
		} else {
			const tabsHtml = await renderTemplate(DamageLog.TABS_TEMPLATE);
			html[0].insertAdjacentHTML("afterBegin", tabsHtml);

			const tabs = new Tabs({
				navSelector: ".damage-log-nav.tabs",
				contentSelector: undefined,
				initial: this.currentTab,
				callback: (event, tabs, tab) => this._onTabSwitch(event, tabs, tab, chatTab)
			});
			tabs.bind(html[0]);

			if (!chatTab.popOut)
				this.tabs = tabs;
		}

		const chatLogElement = html[0].querySelector("#chat-log");
		chatLogElement.insertAdjacentHTML("afterEnd", '<ol id="damage-log"></ol>');

		// Move all the damage log messages into teh damage log tab.
		const damageLogElement = html[0].querySelector("#damage-log");
		const damageMessages = chatLogElement.querySelectorAll(".message.damage-log");
		damageLogElement.append(...damageMessages);
		damageMessages.forEach(m => m.classList.contains("not-permitted") && m.remove());

		this._onTabSwitch(undefined, undefined, this.currentTab, chatTab);

		// Handle scrolling the damage log
		damageLogElement.addEventListener("scroll", this._onScroll.bind(this));

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
	 * Creates the damage log tab when Tabbed Chatlog module is installed.
	 */
	_onTabbedChatlogRenderChatLog(chatTab, html, user) {
		// Append our tab to the end of Tabbed Chatlog's tabs
		const tabs = html[0].querySelector(".tabbedchatlog.tabs");
		tabs.insertAdjacentHTML("beforeEnd", `<a class="item damage-log" data-tab="damage-log">${game.i18n.localize("damage-log.damage-log-tab-name")}</a>`);

		// Override Tabbed Chatlog's callback to call our _onTabSwitch() function first.
		const tabbedChatlogCallback = game.tabbedchat.tabs.callback;
		game.tabbedchat.tabs.callback = ((event, html, tab) => {
			this._onTabSwitch(event, html, tab, chatTab);
			tabbedChatlogCallback(event, html, tab);
		});

		if (chatTab.popOut) {
			if ("damage-log" === this.currentTab) {
				html[0].querySelectorAll(".item.active").forEach(elem => elem.classList.remove("active"));
				html[0].querySelectorAll(".item.damage-log").forEach(elem => elem.classList.add("active"));
			}
		}
	}

	/**
	 * Handle the user switching tabs.
	 */
	_onTabSwitch(event, tabs, tab, chatTab) {
		if (!chatTab.popOut)
			this.currentTab = tab;

		const chatLog = chatTab.element[0].querySelector("#chat-log");
		const damageLog = chatTab.element[0].querySelector("#damage-log");

		if (tab === "damage-log") {
			chatLog.style.display = "none";
			damageLog.style.display = "";
			damageLog.scrollTop = damageLog.scrollHeight;
			this.prevScrollTop = damageLog.scrollTop;
		}
		else
		{
			damageLog.style.display = "none";
			chatLog.style.display = "";
			chatLog.scrollTop = chatLog.scrollHeight;
		}
	}

	/**
	 *	Disable the chat notification on damage log messages.
	 */
	_onChatLogNotify(wrapper, message, ...args) {
		if (Util.getDocumentData(message)?.flags["damage-log"])
			return;

		return wrapper(message, ...args);
	}

	/**
	 *	Handle updating the timestamps on damage log messages.
	 */
	_onUpdateTimestamps(wrapper, ...args) {
		wrapper(...args);

		// "this" will be a ChatLog here
		const messages = this.element[0].querySelectorAll("#damage-log .message");
		for (const li of messages) {
			const message = game.messages.get(li.dataset["messageId"]);
			if (!message || !Util.getDocumentData(message).timestamp) continue;

			const stamp = li.querySelector('.message-timestamp');
			stamp.textContent = foundry.utils.timeSince(Util.getDocumentData(message).timestamp);
		}
	}

	_onMessageLogFlush(wrapper, ...args) {
		if (this.hasTabbedChatlog && (this.currentTab === "damage-log")) {
			return Dialog.confirm({
				title: game.i18n.localize("CHAT.FlushTitle"),
				content: game.i18n.localize("CHAT.FlushWarning"),
				yes: () => {
					const damageLogMessagesIds = game.messages.filter(message => "damage-log" in Util.getDocumentData(message).flags).map(message => message.id);
					game.messages.documentClass.deleteDocuments(damageLogMessagesIds, {deleteAll: false});
				},
				options: {
					top: window.innerHeight - 150,
					left: window.innerWidth - 720
				}
			});
		}
		else {
			return wrapper(...args);
		}
	}

	/**
	 * Handle scrolling to top of the damage log.  If the scrollbar reaches the top, load more messages.
	 */
	async _onScroll(event) {
		const element = event.target;

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
	_onChangeSidebarTab(tab) {
		if (tab.id === "chat")
			this.tabs?.activate(this.currentTab);
	}

	/**
	 * Handle the sidebar collapsing / being revealed.
	 * When the sidebar is revealed and the current tab is the damage log, scroll to the end of the log
	 * For some reason this doesn't work unless we wait at least 250ms first.
	 */
	_onCollapseSidebar(sidebar, isCollapsing) {
		if (!isCollapsing && ("damage-log" === this.currentTab)) {
			const damageLog = sidebar.element[0].querySelector("#damage-log");
			setTimeout(() => damageLog.scrollTop = damageLog.scrollHeight, 250);
		}
	}

	/**
	 * Handle the "getChatLogEntryContext" hook.
	 * This sets up the right click context menus for chat messages.
	 */
	_onGetChatLogEntryContext(html, options) {
		const canUndo = (li) => {
			if (game.user.isGM) return true;
			if (!this.settings.allowPlayerUndo) return false;

			const message = game.messages.get(li[0].dataset["messageId"]);
			const actor = ChatMessage.getSpeakerActor(Util.getDocumentData(message)?.speaker);
			return actor?.testUserPermission(game.user, Util.PERMISSION_CONSTS.OWNER);
		};

		options.push(
			{
				name: game.i18n.localize("damage-log.undo-damage"),
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => canUndo(li) && li[0].matches(".damage-log.damage:not(.reverted)"),
				callback: li => this._undoDamage(li[0])
			},
			{
				name: game.i18n.localize("damage-log.undo-healing"),
				icon: '<i class="fas fa-undo-alt"></i>',
				condition: li => canUndo(li) && li[0].matches(".damage-log.healing:not(.reverted)"),
				callback: li => this._undoDamage(li[0])
			},
			{
				name: game.i18n.localize("damage-log.redo-damage"),
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => canUndo(li) && li[0].matches(".damage-log.damage.reverted"),
				callback: li => this._undoDamage(li[0])
			},
			{
				name: game.i18n.localize("damage-log.redo-healing"),
				icon: '<i class="fas fa-redo-alt"></i>',
				condition: li => canUndo(li) && li[0].matches(".damage-log.healing.reverted"),
				callback: li => this._undoDamage(li[0])
			}
		);
	}

	/**
	 * Handle the "preUpdateActor" hook.
	 * Calculate the difference between the old and new HP values for the actor and creates the damage log chat message.
	 */
	async _onPreUpdateActor(actor, updateData, options, userId) {
		if (userId !== game.user.id) return;
		if (options["damage-log"]?.messageId) return;

		// getSpeaker should really expect a TokenDocument, but there is a bug in Foundry 0.8.8 that makes it only accept a Token.
		const token = (isNewerVersion(game.version ?? game.data.version, "0.8.8") ? actor.token : actor.token?._object);
		const speaker = ChatMessage.getSpeaker({ actor, token });

		// For "real" (i.e. non-synthetic) actors, make sure there is a linked token in the current scene.
		if (!actor.isToken) {
			const activeTokens = actor.getActiveTokens({linked: true});
			if (!activeTokens.find(i => i.id === speaker.token))
				return;
		}

		// Get a nested property of an object using a string.
		const getAttrib = (obj, path) => {
			return path && path.split('.').reduce((prev, curr) => prev && prev[curr], obj);
		}

		const actorSystemData = Util.getSystemData(actor);
		const systemUpdates = (Util.isV10 ? updateData.system : updateData.data);

		const oldValue = getAttrib(actorSystemData, this.system.value) ?? 0;
		const newValue = getAttrib(systemUpdates, this.system.value) ?? oldValue;

		const oldTemp = getAttrib(actorSystemData, this.system.temp) ?? 0;
		const newTemp = getAttrib(systemUpdates, this.system.temp) ?? oldTemp;

		let hpLocalizationName = `damage-log.${game.system.id}.hp-name`;
		if (!game.i18n.has(hpLocalizationName))
			hpLocalizationName = "damage-log.default.hp-name";

		const flags = {
			speaker,
			value: {
				name: game.i18n.localize(hpLocalizationName),
				old: oldValue, new: newValue, diff: newValue - oldValue
			},
			temp: {
				old: oldTemp, new: newTemp, diff: newTemp - oldTemp
			}
		};

		if (this.system.others) {
			for (const [ otherId, otherConfig ] of Object.entries(this.system.others)) {
				const otherLocalizationName = `damage-log.${game.system.id}.${otherId}-name`;
				const otherName = (game.i18n.has(otherLocalizationName) ? game.i18n.localize(otherLocalizationName) : otherId);

				const oldOther = getAttrib(actorSystemData, otherConfig.value) ?? 0;
				const newOther = getAttrib(systemUpdates, otherConfig.value) ?? oldOther;
				const otherDiff = newOther - oldOther;
		
				if (0 != otherDiff) {
					flags.others ??= [];
					flags.others.push({
						id: otherId,
						name: otherName,
						old: oldOther, new: newOther, diff: otherDiff
					});
				}
			}
		}

		if ((0 === flags.temp.diff) && (0 === flags.value.diff) && !flags.others) return;

		// There is a bug in Foundry 0.8.8 that causes preUpdateActor to fire multiple times.
		// Ignore duplicate updates.
		const stringifiedFlags = JSON.stringify(flags);
		if (stringifiedFlags !== this.prevFlags)
		{
			this.prevFlags = stringifiedFlags;

			// No need to keep the speaker data in the flags, because it is also in the chatData.
			// We only kept it in there briefly for the stringify check.
			delete flags.speaker;

			if (this.settings.useTab && this.hasTabbedChatlog)
			{
				// If the rolls notification is not currently showing, set a flag so we can prevent it from showing in _onRenderChatMessage.
				const rollsNotification = document.getElementById("rollsNotification");
				if (rollsNotification?.style.display === "none")
					flags.preventRollsNotification = true;
			}

			const { isHealing, totalDiff } = this._analyseFlags(flags);

			const flavorOptions = {
				diff: Math.abs(totalDiff),
				damageType: this.damageType
			};

			let content = ''
			if (0 != flags.value.diff)
				content += `${flags.value.name}: ${flags.value.old} -&gt; ${flags.value.new} `;
			if (0 != flags.temp.diff)
				content += `Temp: ${flags.temp.old} -&gt; ${flags.temp.new}`;

			const chatData = {
				flags: { "damage-log": flags },
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				flavor: game.i18n.format((isHealing ? "damage-log.healing-flavor-text" : "damage-log.damage-flavor-text"), flavorOptions),
				content,
				speaker
			};

			// If limited player view is enabled, send messages to all players (confidential info will get stripped out in _onRenderChatMessage)
			// Otherwise, only send the message to the players who have the correct permissions.
			if (!this.settings.allowPlayerView || (!this.settings.showLimitedInfoToPlayers || (isHealing && this.settings.hideHealingInLimitedInfo)))
				chatData["whisper"] = game.users.contents.filter(user => this._canUserViewActorDamage(user, actor)).map(user => user.id);

			ChatMessage.create(chatData, {});
		}
	}

	/**
	 * Handle the "updateActor" hook.
	 * Only interested in this hook when the user reverts or re-applys damage/healing.
	 * Sets or clears the "reverted" flag in the message.
	 */
	_onUpdateActor(actor, updateData, options, userId) {
		const flags = options["damage-log"];
		if (flags?.messageId)
		{
			const message = game.messages.get(flags.messageId);
			if (!message) return;

			// If the user that created the message is connected, let their client update the message.
			// Otherwise let the GM do it.
			const messageData = Util.getDocumentData(message);
			if (messageData.user.active ? (messageData.user.id === game.user.id) : game.user.isGM)
			{
				// Changing the message flags will cause the renderChatMessage hook to fire
				if (flags.revert > 0)
					message.setFlag("damage-log", "revert", true);
				else
					message.unsetFlag("damage-log", "revert");
			}
		}
	}

	/**
	 * Handle the "renderChatMessage" hook.
	 * Applies classes to the message's HTML based on the message flags.
	 */
	async _onRenderChatMessage(message, html, data) {
		const messageData = Util.getDocumentData(message);
		const flags = messageData?.flags["damage-log"];
		if (!flags) return;

		const classList = html[0].classList;

		classList.add("damage-log");

		if (flags.revert)
			classList.add("reverted");
		else
			classList.remove("reverted");

		if (this._analyseFlags(flags).isHealing)
			classList.add("healing");
		else
			classList.add("damage");

		// Work out if the user is allowed to see the damage table, and then add it to the HTML.
		let canViewTable = game.user.isGM;
		if (!canViewTable && this.settings.allowPlayerView) {
			const actor = ChatMessage.getSpeakerActor(messageData?.speaker);
			canViewTable = this._canUserViewActorDamage(game.user, actor);
		}

		if (!canViewTable && (!this.settings.showLimitedInfoToPlayers || (isHealing && this.settings.hideHealingInLimitedInfo)))
			classList.add("not-permitted");

		if (this.settings.useTab && this.hasTabbedChatlog) {
			// Do the following after Tabbed Chatlog has rendered.
			new Promise(r => {
				// If the rolls notification wasn't showing before the message was created, then hide it again.
				// TODO - this currently only works for the user that modified the token.
				if (flags.preventRollsNotification)
					document.getElementById("rollsNotification").style.display = "none";
				classList.remove("hardHide");
				classList.add("hard-show")
				html[0].style.display = "";
				r();
			});
		}

		const content = html[0].querySelector("div.message-content");

		// The current content is just some placeholder text.  Completely replace it with the HTML table, or nothing if the user is not allowed to see it.
		content.innerHTML = (canViewTable ? await renderTemplate(DamageLog.TABLE_TEMPLATE, flags) : "");
	}

	/**
	 * Check whether a user has permission to see a given actor's damage info or not.
	 */
	_canUserViewActorDamage(user, actor) {
		if (user.isGM) return true;
		if (!this.settings.allowPlayerView) return false;
 
		return actor?.testUserPermission(user, this.settings.minPlayerPermission);
	};

	/**
	 * Undo the the damage on a given message.
	 */
	_undoDamage(li) {
		const message = game.messages.get(li.dataset["messageId"]);
		const messageData = Util.getDocumentData(message);
		const speaker = messageData.speaker;
		const flags = messageData.flags["damage-log"];

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
		if (!messageData.user.active) {
			const activGMs = game.users.filter(u => u.isGM && u.active);
			if (!activGMs || (0 === activGMs.length)) {
				const messageFlags = {
					undo: ((modifier > 0) ? "undo" : "redo"),
					damage: li.classList.contains("healing") ? "healing" : "damage",
					user: messageData.user.name
				};
				ui.notifications.error(game.i18n.format("damage-log.error.no-undo-user", messageFlags));
			}
		}

		const actorData = Util.getDocumentData(token.actor);
		const systemData = Util.getSystemData(token.actor);

		// Get a nested property of actorData.data using a string.
		const getActorAttrib = (path) => {
			return path && path.split('.').reduce((prev, curr) => prev && prev[curr], systemData);
		}

		const update = {};
		const updatePath = (Util.isV10 ? "system" : "data");

		if (this.system.value) {
			let newValue = (getActorAttrib(this.system.value) ?? 0) - (flags.value.diff * modifier);

			if (this.settings.clampToMin) {
				const minHp = getActorAttrib(this.system.min) ?? 0;
				newValue = Math.max(newValue, minHp);
			}

			if (this.settings.clampToMax && this.system.max) {
				const maxHp = getActorAttrib(this.system.max) + (getActorAttrib(this.system.tempMax) ?? 0);
				newValue = Math.min(newValue, maxHp);
			}

			update[`${updatePath}.${this.system.value}`] = newValue;
		}

		if (this.system.temp) {
			const newTemp = getActorAttrib(this.system.temp) - (flags.temp.diff * modifier);
			update[`${updatePath}.${this.system.temp}`] = Math.max(newTemp, 0);
		}

		if (flags.others) {
			for (const otherData of flags.others) {
				const otherConfig = this.system.others?.[otherData.id];
				if (!otherConfig) continue;

				let newOtherValue = getActorAttrib(`${otherData.id}.value`) - (otherData.diff * modifier);

				if (this.settings.clampToMin) {
					const minOther = getActorAttrib(otherConfig.min) ?? 0;
					newOtherValue = Math.max(newOtherValue, minOther);
				}

				if (this.settings.clampToMax) {
					const maxOther = getActorAttrib(otherConfig.max) ?? 0;
					newOtherValue = Math.min(newOtherValue, maxOther);
				}

				update[`${updatePath}.${otherConfig.value}`] = newOtherValue;
			}
		}

		token.actor.update(update, { "damage-log": { revert: modifier, messageId: message.id } });
	}

	/**
	 * Returns an object containing data about the healing/damage in the flags.
	 */
	_analyseFlags(flags) {
		// Sum up all the diffs in the "others" section of the flags.
		// If the "invert" paramater of the section does not match the master invert flag, then subtract the diff instead of adding.
		const othersDiff = (flags.others) ? flags.others.reduce((prev, curr) => { 
			if (!!this.system.others?.[curr.id]?.invert === !!this.system.invert)
				return prev + curr.diff;
			else
				return prev - curr.diff;
		}, 0) : 0;

		const totalDiff = flags.temp.diff + flags.value.diff + othersDiff;
		const isHealing = this.system.invert ? (totalDiff < 0) : (totalDiff > 0);
		return { isHealing, totalDiff } ;
	}
}

/**
 * Initialization.  Create the DamageLog.
 */
Hooks.once("init", () => {
	game.damageLog = new DamageLog();

	/**
	 * Ready handling.  Convert damage log messages from to new flag format.
	 */
	Hooks.once("ready", async () => {

		if (!game.modules.get('lib-wrapper')?.active && game.user.isGM)
			ui.notifications.error("Damage Log requires the 'libWrapper' module. Please install and activate it.", { permanent: true });

		if (game.user.isGM && (game.damageLog.settings.dbVersion < 1))
		{
			console.log("Damage Log | Updating message database");

			let haveNotified = false;
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

			console.log("Damage Log | Finished updating message database");
			if (haveNotified)
				ui.notifications.info("Damage Log | Finished updating message database", { permanent: true });
		}
	});
});
