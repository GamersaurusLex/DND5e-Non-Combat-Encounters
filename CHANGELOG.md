# Changelog

## Unreleased

- Added schema-versioned encounter migration that preserves existing world records.
- Added the shared runtime foundation: authoritative GM persistence, socket synchronization, reconnect recovery, automatic encounter opening, participant ownership validation, actor/target selection, acted-state tracking, rounds, persistent check requests, manual points, logs, complete-state undo, pause/resume, and End & Publish.
- Added player-safe encounter payloads that omit undo history, pending GM requests, and hidden DC values.
- Added configurable hidden, relative, or exact player DC visibility.
- Fixed Create Encounter persisting an empty draft before its editor was saved; closing a brand-new editor now discards the unsaved encounter.
- Fixed the Non-Combat Encounters sidebar button remaining visually selected after opening another sidebar tab.
- Added the D&D5e roll engine for ability checks, skills, saving throws, and tools using the system's supported roll APIs.
- Added actor modifiers to available checks and pending requests, including proficiency and expertise calculated by D&D5e.
- Added GM roll confirmation with normal, advantage, disadvantage, situational modifiers, notes, and roll visibility.
- Added DC adjudication, optional ±5 critical outcomes, styled result cards, and complete roll audit details.
- Completed the first Social Encounter vertical slice with nicknames, background/appearance/personality notes, cinematic portraits, optional target clocks, configurable point awards, thresholds, and player-visible rewards.
- Added weaknesses, resistances, circumstances, conditional and limited-use modifiers, cross-target point rewards, GM-controlled reward activation, and threshold gain/loss chat notices.
- Generalized thresholds and rewards for every encounter type, including item links, currency rewards, manual reveal/hide controls, and item/currency detail in chat and Journal summaries.

## 0.0.1 — 2026-09-16

- Created the independent D&D 5e module project.
- Added ApplicationV2 encounter management, editing, and tracking foundations.
- Added initial Social, Research, Chase, Exploration, and Skill Challenge data structures.
- Added D&D ability, skill, and saving-throw configuration with per-check guidance.
- Verified installation and the create, save, and activate workflow against D&D 5e 6.0.2 on Foundry 14.367.
- Fixed indexed target/check persistence and live manager refresh behavior found during the first world test.
- Added a dedicated right-sidebar encounter directory directly beneath Journal, with create, activate, open, edit, pause, resume, and delete controls for GMs and active-encounter access for players.
- Added an editor drop zone that creates targets, research sources, obstacles, locations, or challenges from Actors and Items while retaining their Foundry UUID.
- Made check display labels follow skill selections automatically unless the GM has deliberately entered a custom label.
