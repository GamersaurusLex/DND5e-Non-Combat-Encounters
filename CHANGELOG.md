# Changelog

## Unreleased

## 0.1.1 — 2026-09-18

- Fixed the release archive layout so `module.json` is at the ZIP root, allowing Forge to discover the installed module.

## 0.1.0 — 2026-09-18

- Added Research and Chase encounter workflows, including player-safe synchronization, configurable checks, points, thresholds, rewards, and Journal publication.
- Added D&D 5e ability checks, skills, saving throws, tools, advantage/disadvantage, roll confirmation, and configurable critical outcomes.
- Added GM approval of player check requests, actor ownership validation, automatic encounter opening, and actionable player encounter tracking.
- Added chase obstacles, quarry movement and pacing, exhaustion options, obstacles, progress, win/escape states, and participant dropout at Exhaustion 5.
- Added social encounter targets, weaknesses, resistances, circumstances, narrative and mechanical rewards, and optional progress clocks.
- Added actor and item drag-and-drop for encounter targets, sources, obstacles, locations, and challenges.
- Rebuilt the sidebar to match the PF2e module: native-style type selection on creation, compact icon-and-name directory rows, and right-click lifecycle, duplicate, import/export, and delete actions.

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
