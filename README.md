# Tely’s Wayfinder’s Guide to Eberron · 2018 / 2014

A single Foundry VTT module for the original 176-page **2018 campaign prototype** supplied for this conversion. Uses **2014 rules**, Foundry **14** and D&D5e **5.3.3**. This is an initial conversion with offline validation; live Foundry acceptance is pending.

Install manifest: `https://github.com/Telynor/tely-eberron-wayfinder-2014/releases/latest/download/module.json`

Enable **Midi-QOL for Foundry 14**, **libWrapper** and **socketlib**. A connected GM is needed for player reactions, effects on other actors, companion movement and damage transfer. Tasha’s v0.1.1 or later supplies the existing Artificer class and subclasses. No Artificer documents are copied here. Standard 2014 spells use the D&D5e system compendium.

## Contents

| Pack | Entries |
| --- | ---: |
| Ancestries and dragonmarks | 22 |
| Ancestry features | 71 |
| Feats | 3 |
| House Agent background | 1 |
| Equipment, components and eldritch machines | 28 |
| New spell: Gust | 1 |
| Clawfoot Raptor | 1 |
| Roll tables | 38 |
| Original pages, chapter navigation and setup guide | 187 |
| Setup and automation macros | 11 |
| **Total** | **363** |

All entries have an image or a journal thumbnail. Sourcebook illustrations and a D&D Beyond Clawfoot illustration take priority; remaining entries use fitting Foundry icons. The Clawfoot portrait and token use the same transparent cutout. The full original pages remain available alongside searchable text.

## Use

1. Enable the module and dependencies in a 2014-rules world.
2. Drag an ancestry from **Wayfinder · Ancestries and Dragonmarks** onto a character; complete its native advancements. Each marked ancestry includes its retained base-race traits.
3. Run **Configure Selected Character**, then use feature activities for individual choices. Equip/attune items and choose focus/orb materials. Set Integrated Protection after a long rest.
4. Target the affected creature before using a targeted feature. Triggered reactions are offered before the attack roll. For teleportation, click a destination and confirm visibility and willingness.
5. Use **Manage Eldritch Machines**, **Manage Wind Cube**, **Resolve Falling**, crafting, magewright and story macros for their associated rules.
6. Run **Validate Installed Wayfinder Content** after installation. Then follow [the live-world checklist](docs/RUNTIME-ACCEPTANCE.md).

The module preserves 2018 prototype mechanics, including the original Warforged armor rules, Intuition dice and Aberrant Dragonmark. It does not substitute mechanics from *Eberron: Rising from the Last War* or 2024 rules.

## Shared content

The build checks 850 canonical records from the published Tasha’s source snapshot and the system’s 2014 spell index. Matching classes, subclasses, spells, feats and physical items are linked or skipped. No overlapping entry was introduced. IDs are deterministic and namespaced. Character import guards prevent duplicate singleton features/spells; intentional multiple equipment copies remain possible.

For subsequent book conversions, extend `source/shared-content-registry.json` with the earliest canonical UUID before building. Run the cross-book audit again; do not create another copy of a republished option. Distinct rule revisions require explicit naming and review.

See [automation behavior and limits](docs/AUTOMATION.md), [duplicate audit](docs/duplicate-audit.json), [validation results](docs/validation.json) and [build instructions](docs/BUILD.md).
