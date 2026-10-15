# Live Foundry acceptance — pending

Run in a temporary Foundry 14 world with D&D5e 5.3.3, 2014 rules, compatible Midi-QOL v14, libWrapper, socketlib and Tasha’s v0.1.1 or later. Connect one GM and one player. These checks have not been executed in a real Foundry world.

- [ ] Install from manifest, enable dependencies, load all ten packs; run Validate Installed Wayfinder Content. Confirm strict schemas and canonical UUIDs resolve, including embedded items, activities and advancements.
- [ ] Confirm every compendium row has its image/thumbnail. Place Clawfoot on light and dark maps; verify alpha transparency and complete creature silhouette.
- [ ] Drag each ancestry onto a clean character; confirm total ability increases, languages, proficiencies, senses and retained base traits. Remove it and inspect advancement cleanup.
- [ ] Import the same singleton twice; verify one entry. Import two legitimate equipment copies; verify both remain possible. Run shared-content audit alongside Tasha.
- [ ] Test Shifting at levels 1 and 8, all four subraces, existing temporary HP, manual reversion, short/long rest and duration expiry.
- [ ] Test all Warforged armor modes at proficiency 2 and 4, negative/high Dex, shields, Heavy Plating stealth, long-rest selection, mode deletion and a later manual AC override.
- [ ] Test ordinary/conditional/stacked/Greater Intuition with native skill/tool and initiative dialogs; confirm a cancelled roll preserves one-use benefits.
- [ ] Configure Greater Dragonmark for each mark. Check two/three independent spell uses, ability, fixed spell level, component waiver and exact recovery. Reopen setup after expenditure; no refill.
- [ ] Configure Aberrant Dragonmark. Cancel an enhanced cast; verify no Hit Die loss. Complete it; verify the die, long-rest spell use, Constitution casting and self-damage.
- [ ] Exercise Visage, Dual Mind, Swiftstride and Guardian as a player during GM attacks. Verify offers precede rolls, reaction use, swaps, targets, walls and cancellation.
- [ ] Test double-blade action/bonus order, Revenant finesse/AC and both damage formulas; remove the feat and inspect cleanup.
- [ ] Test Imprint Prey against invisible/hidden quarry within and beyond 60 feet, half cover and three-quarters cover, with another source of disadvantage present.
- [ ] Damage a protected wearer for odd/even totals, resistance, temporary HP and mixed types; verify transfer once, ignoring a second resistance application. Try removing/reattuning a ring, off-scene bearer and a reconnecting GM.
- [ ] Test orb reduction with matching/nonmatching mixed damage and resistance. Verify failures preserve the original native damage application. Test Band of Loyalty at zero HP.
- [ ] Test all item choices, dawn resources, lamp lighting restoration, Docent stabilization, wand attunement counts, Spellsmith expiry and cancellation.
- [ ] Test all five missing-spell services both with and without a canonical installed spell. Check concentration replacement/deletion, wind saves/attacks/falling and Compelled Duel ending conditions.
- [ ] Test eldritch machine radii at boundaries, unrelated spells blocked by Spell Sink, suppression/restoration, Master’s Call eight-creature cap, resonance after one round and original-token retention.
- [ ] Check crafting currency/rollback, magewright cancellation/cost and all 38 table draws. Confirm Finale outcomes 9/10 are reachable.

Record Foundry, system and dependency versions, outcomes and logs before changing the release’s live-test status.
