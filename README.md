# Non-Combat Encounters for D&D 5e

A Foundry VTT module for preparing and running structured non-combat encounters in D&D 5e.

## Initial foundation

- Separate D&D 5e module identity, manifest, storage, and release path
- ApplicationV2 encounter manager, editor, and active tracker
- Social, Research, Chase, Exploration, and Skill Challenge encounter types
- World-scoped reusable encounters
- Actor participant selection
- Multiple targets, sources, obstacles, or challenges
- D&D ability checks, skills, and saving throws with DCs and player guidance
- Draft, active, and paused encounter states
- Schema-versioned data migration
- Synchronized GM/player encounter runtime
- Ownership-aware participant and target selection
- Persistent check requests, rounds, acted states, manual points, logs, and undo
- Pause, resume, reconnect recovery, and End & Publish lifecycle
- Player-safe DC visibility controls

## Planned rules integration

- D&D 5e actor check and saving-throw APIs
- Proficiency, expertise, advantage, disadvantage, and situational bonuses
- Configurable success counting and degrees of outcome
- Player check requests and GM adjudication queue
- Encounter-type-specific progress, thresholds, and rewards
- Import and parsing tools appropriate to D&D adventure text

This project intentionally begins with a system-neutral UI shell and a D&D-specific data vocabulary. PF2e level-based DCs, Lore rules, and degrees of success are not carried into this module.
