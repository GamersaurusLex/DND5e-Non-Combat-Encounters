# Changelog

## Unreleased

- Added schema-versioned encounter migration that preserves existing world records.
- Added the shared runtime foundation: authoritative GM persistence, socket synchronization, reconnect recovery, automatic encounter opening, participant ownership validation, actor/target selection, acted-state tracking, rounds, persistent check requests, manual points, logs, complete-state undo, pause/resume, and End & Publish.
- Added player-safe encounter payloads that omit undo history, pending GM requests, and hidden DC values.
- Added configurable hidden, relative, or exact player DC visibility.
- Fixed Create Encounter persisting an empty draft before its editor was saved; closing a brand-new editor now discards the unsaved encounter.

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
