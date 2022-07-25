import { SystemConfig, Attribute } from "./system-config.js";

export class SupportedConfigs {
    static CONFIGS = new Map();

    static registerConfig(config) {
        this.CONFIGS.set(config.name, config);
        return this;
    }

    static {
        const dndAttributes = [
            new Attribute(
                "hp", 
                "attributes.hp.value", 
                {
                    min: "attributes.hp.min", 
                    max: "attributes.hp.max",
                    tempMax: "attributes.hp.tempMax"
                }
            ),
            new Attribute(
                "temp",
                "attributes.hp.temp"
            )
        ];

        const dnd5e = new SystemConfig("dnd5e").addAttributes(dndAttributes);
        const d35e = new SystemConfig("D35E").addAttributes(dndAttributes);
        const pf1 = new SystemConfig("pf1").addAttributes(dndAttributes);
        const pf2e = new SystemConfig("pf2e").addAttributes(dndAttributes);

        const swade = new SystemConfig("swade")
            .addAttribute(
                new Attribute(
                    "wounds",
                    "wounds.value",
                    {
                        invert: true,
                        min: "wounds.min",
                        max: "wounds.max"
                    }
                )
            )
            .addAttribute(
                new Attribute(
                    "fatigue",
                    "fatigue.value",
                    {
                        invert: true,
                        min: "fatigue.min",
                        max: "fatigue.max"
                  
                    }
                )
            )
            .addAttribute(
                new Attribute(
                    "bennies",
                    "bennies.value",
                    {
                        invert: false,
                        min: "bennies.min",
                        max: "bennies.max"
                    }
                )
            );

        const tormenta20 = new SystemConfig("tormenta20")
            .addAttribute(
                new Attribute(
                    "pv",
                    "attributes.pv.value",
                    {
                        min: "attributes.pv.min",
                        max: "attributes.pv.max"
                    }
                )
            )
            .addAttribute(
                new Attribute(
                    "temp",
                    "attributes.pv.temp"
                )
            );

        const worldbuilding = new SystemConfig("worldbuilding")
            .addAttribute(
                new Attribute(
                    "hp",
                    "health.value",
                    {
                        min: "health.min",
                        max: "health.max"
                    }
                )
            );

        const ageOfSigmarSoulbound = new SystemConfig("age-of-sigmar-soulbound")
            .addAttribute(
                new Attribute(
                    "toughness",
                    "combat.health.toughness.value",
                    {
                        max: "combat.health.toughness.max"
                    }
                )
            );

        this
            .registerConfig(dnd5e)
            .registerConfig(d35e)
            .registerConfig(pf1)
            .registerConfig(pf2e)
            .registerConfig(swade)
            .registerConfig(tormenta20)
            .registerConfig(worldbuilding)
            .registerConfig(ageOfSigmarSoulbound)
    }
}