# Automation behavior

Implemented for Foundry 14 / D&D5e 5.3.3 with Midi-QOL v14, libWrapper and socketlib. **Offline checks pass; a live Foundry session has not been run.** The acceptance checklist identifies integration checks still required. An activity button or script is implementation coverage, not evidence that every possible interaction has been verified.

| Rules | Behavior | Required input |
| --- | --- | --- |
| Ancestries | Native size, ability, language, skill/tool and feature advancements; movement/senses; retained base traits | Native advancement choices |
| Changeling | Identity/portrait/token changes, natural-form return on death, persona tool expertise, pre-attack Visage reaction | Appearance, active persona, suspicion-related Deception context |
| Kalashtar | Psychic resistance, chosen glamour skill, Wisdom-save reaction advantage, private telepathic message/reply window | Skill choice, message, whether to spend reaction |
| Shifters | Short-rest use, level/Constitution temporary HP, Beasthide d6/AC, Longtooth attack, Swiftstride speed/reaction movement, Wildhunt Wisdom checks and scent expertise | Reaction destination; identification of a tracking check |
| Warforged | Poison resistance, contextual poison-save advantage, armor formulas with shield support, Heavy Plating stealth disadvantage, integrated-tool expertise, Iron Fists and Powerful Build | Armor mode after long rest, chosen tool, magical/poison save context |
| Dragonmarks | Conditional or unconditional Intuition as printed; overlapping Intuition sizes; spell links, spell level gates and recovery; marked ancestry advancements | Qualifying lock/threat/vehicle context, targets |
| Greater Dragonmark | Level/mark checks, one ability increase, Intuition increase, independently recovered spell uses and material waiver; repeat setup preserves uses | Eligible ability; Siberys focus for Secret Chest |
| Aberrant Dragonmark | Spell choices, Constitution casting, long-rest spell use, optional Hit Die enhancement and self-damage; cancelled casts refund the die | Spell choices and vitality risk |
| Revenant Blade | Ability advancement, +1 AC when wielded with two hands, finesse, stronger opposite-blade damage; bonus attack requires an Attack action with the weapon that turn | Wielding state |
| House Agent | House-specific proficiencies, starting equipment/20 gp claimed once, house-favor request card | House, allowed tool choices, request and standing |
| Focuses and orb | One matching spell-damage bonus; 1d4 orb reduction before resistance; optional two-hand cantrip range applied to use clone | Held/equipped state, material; DM approval of optional rule |
| Common items | Instant Band of Loyalty death at zero, lantern lighting, Feather Token cast/charge, cleaning/illusion cards, five shiftweave outfits, spellshard text/search/passphrase | Cosmetic descriptions and outfit/text choices |
| Focus items | Bag meal quality/three dawn uses; aura DC; ring damage split/remote transfer; inscriptions, vehicle speed bonus, ward references | Aura age supplied by GM; willing linked wearer; ward UUID and permissions |
| Components | Weapon profile for Armblade, Docent fixed skill bonuses/life support, wand insertion/extension and shared attunement slot | Component attachment, Docent traits/languages, canonical weapon/wand |
| Clawfoot | Native attack/save data; straight movement tracking; pounce save on a hit; prone effect and bonus bite gate | Confirmation that the movement was toward the target |
| Crafting | Source costs/CR/skill thresholds, discounts, coin conversion, schema records and canonical-item delivery; rollback if creation fails | GM confirms actual component/tools/schema and completed downtime |
| Magewrights | Seven profession spell sets using canonical spells, ritual activation/cost transaction | Profession, restricted application adjudication |
| Eldritch machines | Scene placement/radii, spell/conjuration gates, reversible suppression of identifiable spell effects, resonance reanimation queue, Master’s Call DC/commands/control cap, weather records | Placement, attuned controller, narrative weather/world effects |
| Wind and supplemental spells | Canonical installed spells preferred; missing Friends, Blade Ward, Beast Sense, Compelled Duel and Control Winds use services without new compendium copies | Willing/non-hostile targets, wind mode/template position, situational damage context |
| Tables/reference | Native draws with complete ranges and text; all 176 source pages, chapter links and searchable transcription | GM story choices |

## Boundaries that require a person or live-world integration

- Disguise plausibility, contact favors, willingness, weather consequences, rare ingredients, downtime completion and plot-device consequences require a player or GM decision. Activities collect the input and record the result.
- Map data cannot identify every fall, weapon-damage origin, successful quarry tracking check, hostile spell, threat to a ward or disease. Use the supplied contextual activities and **Resolve Falling** when that context is absent. Strong horizontal wind’s additional movement cost and difficult-terrain exceptions are tracked as rules state; the GM reconciles movement when using a movement-cost extension.
- Creature senses do not disclose hidden map information or grant ownership automatically. Beast Sense records the link and switches the caster’s own sight/hearing conditions; the GM shares the beast’s perceptions. Mind Link messages are private to the relevant owners and GMs; reciprocal communication is a roleplay action.
- Compelled Duel checks visible token movement and recognized combat workflows. Non-workflow damage, ambiguous friendly relations and actions resolved outside Midi require the GM to end the linked effect when the spell calls for it.
- Spell Sink blocks recognized magical activities and suppresses identifiable spell/magic-item effects reversibly. The world may contain custom magical features, hardcoded item bonuses or manifest zones owned by another module that expose no machine-readable magic marker. Their suppression requires GM adjudication; the module does not rewrite another module’s scripts.
- Dimensional Seal uses spell school/name plus registered teleport activities. Cross-scene travel or third-party macros that bypass activities need the GM’s check. Master’s Call and resonance reanimation use scene positions; distances between unrelated scenes require world/map input.
- Resonator reanimation reuses an installed canonical Zombie. It creates a new unlinked token and hides the original. Powerful-undead exceptions and missing Zombie sources are reported for the GM. It does not invent a second Zombie compendium entry.
- Spell choices resolve from visible installed 2014 compendiums. The system and Tasha cover most options; other eligible optional spells must be available in the user’s spell libraries. The five named non-SRD services above cover missing spells required by this book.
- Native action consumption, Midi reaction timing, token collision/swap permissions, conditional cover attribution, concentration cleanup, effect transfer and strict Foundry document validation require the live-world checklist. No claim of universal or completed live-world automation is made for this initial build.

## Source decisions

The supplied prototype has no Artificer class/subclass. The class remains canonical in Tasha’s. The Clawfoot has AC 14, 16 HP, speed 50, the printed abilities/attacks and Pounce; it has neither Pack Tactics nor Multiattack. The Finale Location table prints d8 over ten results, so the die is corrected to d10. The legendary crafting row prints 20 workweeks and remains 20.
