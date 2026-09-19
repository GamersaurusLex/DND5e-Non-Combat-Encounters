# Changelog

## Unreleased

## 0.1.5 — 2026-09-19

- Fixed Open-Ended Chase critical successes awarding only one Chase Success; they now correctly award two.
- Added a persistent shared Chase Success total to the active encounter header for both GMs and players.

## 0.1.4 — 2026-09-19

- Reworked the D&D editor, manager, and active tracker to match the proven PF2e encounter workflow, including tabs, compact manager rows, and native-style context menus.
- Completed Open-Ended Chase success-count behavior: no Chase Point thresholds, automatic obstacle advancement after every participant acts, and GM controls for manual Success adjustments.
- Added Global Progress Clocks integration for every encounter type. It is opt-in per encounter, creates one shared clock for global-success encounters or one clock per tracked entry, persists while active or paused, and removes its clocks when the encounter ends or is deleted.
- Preserved the existing in-panel circular progress display as a separate visual preference for Social and Research encounters.
- Limited exhaustion configuration and effects to Post-Combat Chases, and improved chase roll-request validation and state handling.

## 0.1.3 — 2026-09-18

- Added Open-Ended Chase support for both normal and Consequence Chases. The GM chooses the acting participant, then selects the check, DC, modifiers, and roll after hearing the player’s approach.
- Open-Ended Chases hide per-obstacle skill and DC setup and prevent players from submitting roll requests.
- The GM’s tool selector now lists only tools the selected character is proficient with; physical inventory possession remains intentionally optional.

## 0.1.2 — 2026-09-18

- Added Consequence Chase resolution: each eligible participant makes one check per phase, Chase Successes accumulate across the encounter, and configurable outcome tiers resolve the final consequence.
- Added dedicated Consequence Chase setup while hiding quarry pacing, party-balance CP, and per-obstacle CP requirements that do not apply to that mode.
- Fixed the active encounter tracker’s vertical scrolling.
- Pausing now closes the encounter panel for every client, releases the cinematic background, and prevents reopening the tracker until the encounter resumes.
- Renamed the Chase target removal control to **Remove Obstacle**.

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
