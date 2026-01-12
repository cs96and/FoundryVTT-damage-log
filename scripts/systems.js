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

export class Systems {

	/**
	 * Location of HP attributes in D&D-like systems.
	 */
	static #DND_ATTRIBUTES = {
		hp: {
			value: "attributes.hp.value",
			min: "attributes.hp.min",
			max: "attributes.hp.max",
			tempMax: "attributes.hp.tempMax",
		},
		temp: {
			value: "attributes.hp.temp"
		}
	};

	/**
	 * Location of HP attributes for supported systems.
	 */
	static CONFIGS = {
		a5e: Systems.#DND_ATTRIBUTES,
		ac2d20: {
			fatigue: {
				invert: true,
				value: "fatigue"
			},
			fortune: {
				invert: false,
				value: "fortune.value"
			},
			injuries: {
				invert: true,
				value: "injuries.value"
			},
			stress: {
				invert: true,
				value: "stress.value",
				max: "stress.max"
			}
		},
		"age-of-sigmar-soulbound": {
			toughness: {
				value: "combat.health.toughness.value",
				max: "combat.health.toughness.max"
			}
		},
		archmage: Systems.#DND_ATTRIBUTES,
		"black-flag": Systems.#DND_ATTRIBUTES,
		CoC7: {
			hp: {
				value: "attribs.hp.value",
				max: "attribs.hp.max",
			},
			mp: {
				value: "attribs.mp.value",
				max: "attribs.mp.max",
			},
			lck: {
				value: "attribs.lck.value",
				max: "attribs.lck.max",
			},
			san: {
				value: "attribs.san.value",
				max: "attribs.san.max",
			}
		},
		D35E: foundry.utils.mergeObject(Systems.#DND_ATTRIBUTES,
			{
				vigor: {
					value: "attributes.vigor.value",
					min: "attributes.vigor.min",
					max: "attributes.vigor.max"
				},
				vigorTemp: {
					value: "attributes.vigor.temp"
				},
				wounds: {
					value: "attributes.wounds.value",
					min: "attributes.wounds.min",
					max: "attributes.wounds.max"
				},
			},
			{ inplace: false }
		),
		demonlord: {
			corruption: {
				invert: true,
				value: "characteristics.corruption.value",
				min: "characteristics.corruption.min",
			},
			damage: {
				invert: true,
				value: "characteristics.health.value",
				max: "characteristics.health.max",
			},
			insanity: {
				invert: true,
				value: "characteristics.insanity.value",
				min: "characteristics.insanity.min",
				max: "characteristics.insanity.max",
			},
		},
		dnd5e: Systems.#DND_ATTRIBUTES,
		fallout: {
			hp: {
				value: "health.value",
				max: "health.max"
			},
			temp: {
				value: "health.bonus"
			},
			radiation: {
				invert: true,
				value: "radiation"
			}
		},
		dragonbane: {
			hp: {
				value: "hitPoints.value",
				max: "hitPoints.max",
			}
		},
		gurps: {
			hp: {
				value: "HP.value",
				min: "HP.min",
				max: "HP.max"
			},
			fp: {
				value: "FP.value",
				min: "FP.min",
				max: "FP.max"
			}
		},
		mosh: {
			health: {
				value: "health.value",
				min: "health.min",
				max: "health.max"
			},
			wounds: {
				value: "hits.value",
				min: "hits.min",
				max: "hits.max"
			},
			stress: {
				value: "other.stress.value",
				min: "other.stress.min",
				max: "other.stress.max"
			}
		},
		nimble: foundry.utils.mergeObject(Systems.#DND_ATTRIBUTES,
			{
				wounds: {
					invert: true,
					value: "attributes.wounds.value",
					max: "attributes.wounds.max"
				},
			},
			{ inplace: false }
		),
		pf1: foundry.utils.mergeObject(Systems.#DND_ATTRIBUTES,
			{
				hp: {
					offset: "attributes.hp.offset"
				}
			},
			{ inplace: false }
		),
		pf2e: foundry.utils.mergeObject(Systems.#DND_ATTRIBUTES,
			{
				sp: {
					value: "attributes.sp.value",
					max: "attributes.sp.max"
				}
			},
			{ inplace: false }
		),
		pirateborg: {
			hp: {
				value: "attributes.hp.value",
				max: "attributes.hp.max",
			},
			luck: {
				value: "attributes.luck.value",
			},
			agility: {
				value: "abilities.agility.value",
			},
			presence: {
				value: "abilities.presence.value",
			},
			spirit: {
				value: "abilities.spirit.value",
			},
			strength: {
				value: "abilities.strength.value",
			},
			toughness: {
				value: "abilities.toughness.value",
			},
		},
		shadowdark: {
			hp: {
				value: "attributes.hp.value",
				max: "attributes.hp.max",
			}
		},
		shaper: {
			hp: {
				value: "attributes.hp.value",
				min: "attributes.hp.min",
				max: "attributes.hp.max"
			},
			temp: {
				value: "attributes.hp.temp"
			}
		},
		sw5e: Systems.#DND_ATTRIBUTES,
		swade: {
			wounds: {
				invert: true,
				value: "wounds.value",
				min: "wounds.min",
				max: "wounds.max"
			},
			fatigue: {
				invert: true,
				value: "fatigue.value",
				min: "fatigue.min",
				max: "fatigue.max"
			},
			bennies: {
				invert: false,
				value: "bennies.value",
				min: "bennies.min",
				max: "bennies.max"
			}
		},
		tormenta20: {
			pv: {
				value: "attributes.pv.value",
				min: "attributes.pv.min",
				max: "attributes.pv.max",
			},
			temp: {
				value: "attributes.pv.temp"
			}
		},
		tresdetv: {
			mana: {
				value: "pontos.mana.value",
				max: "pontos.mana.max"
			},
			vida: {
				value: "pontos.vida.value",
				max: "pontos.vida.max"
			}
		},
		vaarfeu: Systems.#DND_ATTRIBUTES,
		worldbuilding: {
			hp: {
				value: "health.value",
				min: "health.min",
				max: "health.max"
			}
		},
		"fantastic-depths": {
			hp: {
				value: "hp.value",
				max: "hp.max"
			}
		}
	};
}
