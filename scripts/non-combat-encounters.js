const MODULE_ID = "dnd5e-non-combat-encounters";
const SETTINGS = { encounters: "encounters", active: "activeEncounter" };
const SOCKET = `module.${MODULE_ID}`;
const SCHEMA_VERSION = 2;
const MAX_HISTORY = 30;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CHECK_CHOICES = [
  ["ability:str", "Strength"], ["ability:dex", "Dexterity"], ["ability:con", "Constitution"],
  ["ability:int", "Intelligence"], ["ability:wis", "Wisdom"], ["ability:cha", "Charisma"],
  ["skill:acr", "Acrobatics"], ["skill:ani", "Animal Handling"], ["skill:arc", "Arcana"],
  ["skill:ath", "Athletics"], ["skill:dec", "Deception"], ["skill:his", "History"],
  ["skill:ins", "Insight"], ["skill:itm", "Intimidation"], ["skill:inv", "Investigation"],
  ["skill:med", "Medicine"], ["skill:nat", "Nature"], ["skill:prc", "Perception"],
  ["skill:prf", "Performance"], ["skill:per", "Persuasion"], ["skill:rel", "Religion"],
  ["skill:slt", "Sleight of Hand"], ["skill:ste", "Stealth"], ["skill:sur", "Survival"],
  ["save:str", "Strength Save"], ["save:dex", "Dexterity Save"], ["save:con", "Constitution Save"],
  ["save:int", "Intelligence Save"], ["save:wis", "Wisdom Save"], ["save:cha", "Charisma Save"]
];

const TYPE_LABELS = {
  social: "Social Encounter", research: "Research", chase: "Chase",
  exploration: "Exploration", skill: "Skill Challenge"
};

const clone = (value) => foundry.utils.deepClone(value);
const randomID = () => foundry.utils.randomID();
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));
const checkLabelForKey = (key) => CHECK_CHOICES.find(([value]) => value === key)?.[1] ?? "Check";

function indexedArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).sort(([a], [b]) => Number(a) - Number(b)).map(([, entry]) => entry);
}

function newCheck() {
  return { id: randomID(), key: "skill:per", label: "Persuasion", labelModified: false, dc: 15, guidance: "" };
}

function newTarget(type = "social") {
  const names = { social: "New NPC", research: "New Source", chase: "New Obstacle", exploration: "New Location", skill: "New Challenge" };
  return { id: randomID(), sourceUuid: "", sourceType: "", name: names[type], image: "icons/svg/mystery-man.svg", description: "", points: 0, goal: 4, checks: [newCheck()] };
}

function newEncounter() {
  const id = randomID();
  return {
    id, name: "New Non-Combat Encounter", type: "social", status: "draft",
    schemaVersion: SCHEMA_VERSION, image: "icons/svg/d20-black.svg", description: "", participantIds: [],
    currentRound: 1, roundLimit: 0, targets: [newTarget("social")], activeActorId: "", activeTargetId: "",
    actorsActed: {}, pendingRequests: [], log: [], history: [], dcVisibility: "hidden",
    createdAt: Date.now(), updatedAt: Date.now()
  };
}

function normalize(encounter) {
  encounter.schemaVersion = SCHEMA_VERSION;
  encounter.type = TYPE_LABELS[encounter.type] ? encounter.type : "social";
  encounter.status = ["draft", "active", "paused", "ended"].includes(encounter.status) ? encounter.status : "draft";
  encounter.participantIds = Array.isArray(encounter.participantIds) ? encounter.participantIds : [];
  encounter.currentRound = Math.max(1, Number(encounter.currentRound) || 1);
  encounter.roundLimit = Math.max(0, Number(encounter.roundLimit) || 0);
  encounter.activeActorId ??= "";
  encounter.activeTargetId ??= "";
  encounter.actorsActed = encounter.actorsActed && typeof encounter.actorsActed === "object" ? encounter.actorsActed : {};
  encounter.pendingRequests = indexedArray(encounter.pendingRequests);
  encounter.log = indexedArray(encounter.log);
  encounter.history = indexedArray(encounter.history);
  encounter.dcVisibility = ["hidden", "relative", "exact"].includes(encounter.dcVisibility) ? encounter.dcVisibility : "hidden";
  encounter.targets = indexedArray(encounter.targets);
  encounter.targets.forEach((target) => {
    target.id ||= randomID(); target.name ||= "New Target"; target.image ||= "icons/svg/mystery-man.svg";
    target.sourceUuid ??= ""; target.sourceType ??= ""; target.description ??= ""; target.points = Number(target.points) || 0; target.goal = Math.max(0, Number(target.goal) || 0);
    target.checks = indexedArray(target.checks);
    target.checks.forEach((check) => {
      check.id ||= randomID(); check.key ||= "skill:per"; check.label ||= checkLabelForKey(check.key);
      if (check.labelModified == null) check.labelModified = !CHECK_CHOICES.some(([, label]) => label === check.label);
      check.guidance ??= ""; check.dc = Math.max(0, Number(check.dc) || 0);
    });
  });
  if (!encounter.targets.some((target) => target.id === encounter.activeTargetId)) encounter.activeTargetId = encounter.targets[0]?.id ?? "";
  if (!encounter.participantIds.includes(encounter.activeActorId)) encounter.activeActorId = "";
  return encounter;
}

function participantActors(encounter) {
  return (encounter?.participantIds ?? []).map((id) => game.actors.get(id)).filter(Boolean);
}

function canControlActor(actor, user = game.user) {
  return !!actor && (user?.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
}

function snapshotEncounter(encounter, label) {
  const state = clone(encounter);
  delete state.history;
  encounter.history.push({ id: randomID(), label, at: Date.now(), userId: game.user.id, state });
  if (encounter.history.length > MAX_HISTORY) encounter.history.splice(0, encounter.history.length - MAX_HISTORY);
}

function addLog(encounter, type, text, details = {}) {
  encounter.log.push({ id: randomID(), at: Date.now(), round: encounter.currentRound, type, text, userId: game.user.id, ...details });
}

function publicEncounter(encounter) {
  if (!encounter) return null;
  const safe = clone(encounter);
  delete safe.history;
  safe.pendingRequests = [];
  safe.targets = safe.targets.map((target) => ({
    ...target,
    checks: target.checks.map((check) => ({
      id: check.id, key: check.key, label: check.label, guidance: check.guidance,
      ...(safe.dcVisibility === "exact" ? { dc: check.dc } : {})
    }))
  }));
  return safe;
}

let playerEncounterCache = null;

const Store = {
  all() { return clone(game.settings.get(MODULE_ID, SETTINGS.encounters) ?? {}); },
  get(id = this.activeId()) {
    if (!game.user.isGM) return playerEncounterCache && (!id || playerEncounterCache.id === id) ? normalize(clone(playerEncounterCache)) : null;
    const encounter = this.all()[id];
    return encounter ? normalize(encounter) : null;
  },
  activeId() { return game.settings.get(MODULE_ID, SETTINGS.active) || ""; },
  async save(encounter) {
    encounter.updatedAt = Date.now(); normalize(encounter);
    const records = this.all(); records[encounter.id] = encounter;
    await game.settings.set(MODULE_ID, SETTINGS.encounters, records);
    Hooks.callAll("nonCombatEncounterUpdated", encounter.id);
    if (game.user.isGM && encounter.id === this.activeId()) game.socket.emit(SOCKET, { action: "sync", encounter: publicEncounter(encounter) });
  },
  async remove(id) {
    const records = this.all(); delete records[id];
    await game.settings.set(MODULE_ID, SETTINGS.encounters, records);
    if (this.activeId() === id) await game.settings.set(MODULE_ID, SETTINGS.active, "");
    Hooks.callAll("nonCombatEncounterUpdated", id);
  },
  async setActive(id) {
    await game.settings.set(MODULE_ID, SETTINGS.active, id);
    Hooks.callAll("nonCombatEncounterUpdated", id);
    if (game.user.isGM) game.socket.emit(SOCKET, { action: "sync", encounter: publicEncounter(this.get(id)) });
  }
};

async function migrateEncounters() {
  if (!game.user.isGM) return;
  const records = Store.all();
  let changed = false;
  for (const [id, source] of Object.entries(records)) {
    if ((Number(source.schemaVersion) || 0) >= SCHEMA_VERSION) continue;
    records[id] = normalize(source);
    changed = true;
  }
  if (changed) {
    await game.settings.set(MODULE_ID, SETTINGS.encounters, records);
    ui.notifications.info("Non-Combat Encounters data was updated to the current schema.");
  }
}

function createEncounter() {
  const encounter = newEncounter();
  new EncounterEditor(encounter).render({ force: true });
}

async function activateEncounter(id) {
  const encounter = Store.get(id);
  if (!encounter) return;
  encounter.status = "active";
  await Store.save(encounter);
  await Store.setActive(encounter.id);
  tracker.render(true);
  game.socket.emit(SOCKET, { action: "open", encounter: publicEncounter(encounter) });
}

async function pauseEncounter(id) {
  const encounter = Store.get(id);
  if (!encounter) return;
  encounter.status = "paused";
  await Store.save(encounter);
  await Store.setActive(encounter.id);
  tracker.render(false);
}

async function resumeEncounter(id) {
  await activateEncounter(id);
}

function journalHtml(encounter) {
  const targets = encounter.targets.map((target) => `<section><h2>${esc(target.name)}</h2>${target.description ? `<p>${esc(target.description)}</p>` : ""}<p><strong>Progress:</strong> ${target.points}${target.goal ? ` / ${target.goal}` : ""}</p></section>`).join("");
  const log = encounter.log.length ? `<h2>Encounter Log</h2><ul>${encounter.log.map((entry) => `<li><strong>Round ${entry.round}:</strong> ${esc(entry.text)}</li>`).join("")}</ul>` : "";
  return `<h1>${esc(encounter.name)}</h1><p>${esc(encounter.description)}</p>${targets}${log}`;
}

async function endEncounter(id) {
  if (!game.user.isGM) return;
  const encounter = Store.get(id);
  if (!encounter) return;
  snapshotEncounter(encounter, "Before ending encounter");
  encounter.status = "ended";
  addLog(encounter, "lifecycle", "The encounter ended.");
  await Store.save(encounter);
  const existing = game.journal.find((journal) => journal.getFlag(MODULE_ID, "encounterId") === encounter.id);
  const data = { name: encounter.name, pages: [{ name: "Summary", type: "text", text: { content: journalHtml(encounter), format: 1 } }], flags: { [MODULE_ID]: { encounterId: encounter.id } } };
  if (existing) await existing.update({ name: data.name, pages: data.pages });
  else await JournalEntry.create(data);
  await Store.setActive("");
  tracker.close();
  game.socket.emit(SOCKET, { action: "closed", encounterId: encounter.id });
  ui.notifications.info(`${encounter.name} ended and was published to the Journal.`);
}

async function mutateActive(label, callback) {
  if (!game.user.isGM) return;
  const encounter = Store.get();
  if (!encounter) return;
  snapshotEncounter(encounter, label);
  await callback(encounter);
  await Store.save(encounter);
}

async function undoActiveEncounter() {
  if (!game.user.isGM) return;
  const encounter = Store.get();
  const previous = encounter?.history.pop();
  if (!encounter || !previous?.state) return ui.notifications.warn("There is nothing to undo.");
  const remainingHistory = encounter.history;
  const restored = normalize(clone(previous.state));
  restored.history = remainingHistory;
  addLog(restored, "undo", `Undid: ${previous.label}.`);
  await Store.save(restored);
}

async function handlePlayerRequest(payload) {
  if (!game.user.isGM) return;
  const encounter = Store.get(payload.encounterId);
  const user = game.users.get(payload.userId);
  const actor = game.actors.get(payload.actorId);
  const target = encounter?.targets.find((entry) => entry.id === payload.targetId);
  const check = target?.checks.find((entry) => entry.id === payload.checkId);
  if (!encounter || encounter.status !== "active" || !user || !canControlActor(actor, user) || !encounter.participantIds.includes(actor.id) || !target || !check) return;
  if (encounter.actorsActed[actor.id]) return;
  const duplicate = encounter.pendingRequests.some((request) => request.actorId === actor.id && request.status === "pending");
  if (duplicate) return;
  snapshotEncounter(encounter, "Queued check request");
  encounter.pendingRequests.push({ id: randomID(), status: "pending", createdAt: Date.now(), userId: user.id, actorId: actor.id, actorName: actor.name, targetId: target.id, targetName: target.name, checkId: check.id, checkLabel: check.label });
  encounter.activeActorId = actor.id;
  encounter.activeTargetId = target.id;
  addLog(encounter, "request", `${actor.name} requested ${check.label} against ${target.name}.`, { actorId: actor.id, targetId: target.id, checkId: check.id });
  await Store.save(encounter);
  ui.notifications.info(`${actor.name} requested a ${check.label} check.`);
}

function handleSocketMessage(message) {
  if (!message?.action) return;
  if (message.action === "request") return handlePlayerRequest(message);
  if (message.action === "request-sync" && game.user.isGM) return game.socket.emit(SOCKET, { action: "sync", encounter: publicEncounter(Store.get()) });
  if (message.action === "sync" && !game.user.isGM) {
    const shouldOpen = !playerEncounterCache && message.encounter?.status === "active";
    playerEncounterCache = message.encounter ? normalize(message.encounter) : null;
    Hooks.callAll("nonCombatEncounterUpdated", playerEncounterCache?.id ?? "");
    if (shouldOpen) tracker?.render(true);
  }
  if (message.action === "open" && !game.user.isGM) {
    playerEncounterCache = message.encounter ? normalize(message.encounter) : null;
    tracker?.render(true);
  }
  if (message.action === "closed" && !game.user.isGM) {
    playerEncounterCache = null;
    tracker?.close();
  }
}

async function deleteEncounter(id) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Delete Encounter" },
    content: "<p>Delete this encounter permanently?</p>"
  });
  if (!confirmed) return;
  if (Store.activeId() === id) await endEncounter(id);
  await Store.remove(id);
  tracker.render(false);
}

class EncounterManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dnd5e-nce-manager", tag: "form", classes: ["dnd5e-nce", "standard-form"],
    position: { width: 760, height: 620 }, window: { title: "Non-Combat Encounters", icon: "fa-solid fa-people-group", resizable: true },
    actions: { create: EncounterManager.create, edit: EncounterManager.edit, activate: EncounterManager.activate, pause: EncounterManager.pause, resume: EncounterManager.resume, open: EncounterManager.open, remove: EncounterManager.remove }
  };
  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/manager.hbs` } };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const activeId = Store.activeId();
    return { ...context, isGM: game.user.isGM, activeEncounter: !!activeId, encounters: Object.values(Store.all()).map(normalize).sort((a, b) => b.updatedAt - a.updatedAt).map((encounter) => ({ ...encounter, typeLabel: TYPE_LABELS[encounter.type], active: encounter.id === activeId })) };
  }
  static async create() { await createEncounter(); this.render({ force: true }); }
  static edit(_event, target) { new EncounterEditor(Store.get(target.dataset.id)).render({ force: true }); }
  static async activate(_event, target) { await activateEncounter(target.dataset.id); this.render({ force: true }); }
  static async pause(_event, target) { await pauseEncounter(target.dataset.id); this.render({ force: true }); }
  static async resume(_event, target) { await resumeEncounter(target.dataset.id); this.render({ force: true }); }
  static open() { tracker.render(true); }
  static async remove(_event, target) {
    await deleteEncounter(target.dataset.id); this.render({ force: true });
  }
}

class EncounterEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(encounter, options = {}) { super(options); this.encounter = clone(encounter); }
  static DEFAULT_OPTIONS = {
    id: "dnd5e-nce-editor", tag: "form", classes: ["dnd5e-nce"],
    position: { width: 820, height: 760 }, window: { icon: "fa-solid fa-pen-to-square", resizable: true, contentClasses: ["standard-form", "nce-editor"] },
    form: { closeOnSubmit: false, handler: EncounterEditor.submit },
    actions: { addTarget: EncounterEditor.addTarget, removeTarget: EncounterEditor.removeTarget, addCheck: EncounterEditor.addCheck, removeCheck: EncounterEditor.removeCheck }
  };
  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/editor.hbs`, root: true, scrollable: [".content"] } };
  get title() { return `Encounter: ${this.encounter.name}`; }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const selected = new Set(this.encounter.participantIds);
    const actors = game.actors.filter((actor) => actor.type === "character").map((actor) => ({ id: actor.id, name: actor.name, image: actor.img, selected: selected.has(actor.id) }));
    const dropLabels = { social: "targets", research: "sources", chase: "obstacles", exploration: "locations", skill: "challenges" };
    return { ...context, encounter: this.encounter, actors, typeLabels: TYPE_LABELS, checkChoices: Object.fromEntries(CHECK_CHOICES), dcVisibilities: { hidden: "Hidden", relative: "Relative difficulty", exact: "Exact DCs" }, dropLabel: dropLabels[this.encounter.type] };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const zone = this.element.querySelector("[data-target-drop-zone]");
    if (zone) {
      zone.addEventListener("dragenter", (event) => { event.preventDefault(); zone.classList.add("dragover"); });
      zone.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; zone.classList.add("dragover"); });
      zone.addEventListener("dragleave", (event) => { if (!zone.contains(event.relatedTarget)) zone.classList.remove("dragover"); });
      zone.addEventListener("drop", (event) => this._onTargetDrop(event));
    }
    for (const row of this.element.querySelectorAll(".nce-check-row")) {
      const select = row.querySelector('select[name$=".key"]');
      const label = row.querySelector('input[name$=".label"]');
      const modified = row.querySelector('input[name$=".labelModified"]');
      if (label && select && modified?.value !== "true") label.value = select.selectedOptions[0]?.textContent?.trim() || checkLabelForKey(select.value);
      select?.addEventListener("change", () => {
        if (!label || modified?.value === "true") return;
        label.value = select.selectedOptions[0]?.textContent?.trim() || checkLabelForKey(select.value);
      });
      label?.addEventListener("input", () => {
        if (modified) modified.value = String(Boolean(label.value.trim()));
      });
    }
  }
  async _onTargetDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("dragover");
    let data = {};
    try { data = TextEditor.getDragEventData(event); }
    catch (_error) { try { data = JSON.parse(event.dataTransfer?.getData("text/plain") || "{}"); } catch (_parseError) { return; } }
    let dropped = data.uuid ? await fromUuid(data.uuid) : null;
    if (dropped?.documentName === "Token") dropped = dropped.actor;
    if (!dropped && data.actorId) dropped = game.actors.get(data.actorId);
    if (!dropped || !["Actor", "Item"].includes(dropped.documentName)) return ui.notifications.warn("Drop an Actor or Item from the sidebar.");
    if (dropped.uuid && this.encounter.targets.some((target) => target.sourceUuid === dropped.uuid)) return ui.notifications.info(`${dropped.name} has already been added.`);

    this._capture();
    const created = newTarget(this.encounter.type);
    created.sourceUuid = dropped.uuid || "";
    created.sourceType = dropped.documentName;
    created.name = dropped.name || created.name;
    created.image = dropped.img || "icons/svg/mystery-man.svg";
    const description = dropped.system?.description?.value ?? dropped.system?.details?.biography?.value ?? "";
    if (description) {
      const container = document.createElement("div");
      container.innerHTML = description;
      created.description = (container.textContent ?? "").trim();
    }
    this.encounter.targets.push(created);
    ui.notifications.info(`Added ${created.name} from the ${dropped.documentName} directory.`);
    await this.render({ force: true });
  }
  _capture() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    foundry.utils.mergeObject(this.encounter, foundry.utils.expandObject(data), { inplace: true, overwrite: true });
    this.encounter.participantIds = [...this.element.querySelectorAll('[name="participantIds"]:checked')].map((input) => input.value);
    normalize(this.encounter);
  }
  static async submit(_event, _form, formData) {
    foundry.utils.mergeObject(this.encounter, foundry.utils.expandObject(formData.object), { inplace: true, overwrite: true });
    this.encounter.participantIds = [...this.element.querySelectorAll('[name="participantIds"]:checked')].map((input) => input.value);
    await Store.save(this.encounter); ui.notifications.info("Encounter saved."); await this.render({ force: true });
  }
  static async addTarget() { this._capture(); this.encounter.targets.push(newTarget(this.encounter.type)); await this.render({ force: true }); }
  static async removeTarget(_event, target) { this._capture(); this.encounter.targets.splice(Number(target.dataset.index), 1); await this.render({ force: true }); }
  static async addCheck(_event, target) { this._capture(); this.encounter.targets[Number(target.dataset.targetIndex)]?.checks.push(newCheck()); await this.render({ force: true }); }
  static async removeCheck(_event, target) { this._capture(); this.encounter.targets[Number(target.dataset.targetIndex)]?.checks.splice(Number(target.dataset.index), 1); await this.render({ force: true }); }
}

let viewActorId = "";
let viewTargetId = "";

class EncounterTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dnd5e-nce-tracker", classes: ["dnd5e-nce"], position: { width: 760, height: 760 },
    window: { title: "Non-Combat Encounter", icon: "fa-solid fa-people-group", resizable: true },
    actions: {
      manage: EncounterTracker.manage, selectActor: EncounterTracker.selectActor, selectTarget: EncounterTracker.selectTarget,
      requestCheck: EncounterTracker.requestCheck, adjustPoints: EncounterTracker.adjustPoints, nextRound: EncounterTracker.nextRound,
      completeRequest: EncounterTracker.completeRequest, cancelRequest: EncounterTracker.cancelRequest,
      undo: EncounterTracker.undo, pause: EncounterTracker.pause, end: EncounterTracker.end
    }
  };
  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/tracker.hbs` } };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const encounter = Store.get();
    const owned = encounter ? participantActors(encounter).filter((actor) => canControlActor(actor)) : [];
    if (encounter && !owned.some((actor) => actor.id === viewActorId)) viewActorId = owned[0]?.id ?? "";
    if (encounter && !encounter.targets.some((target) => target.id === viewTargetId)) viewTargetId = encounter.activeTargetId || encounter.targets[0]?.id || "";
    const participants = encounter ? participantActors(encounter).map((actor) => ({ id: actor.id, name: actor.name, image: actor.img, owned: canControlActor(actor), acted: !!encounter.actorsActed[actor.id], selected: actor.id === viewActorId })) : [];
    if (encounter) encounter.targets = encounter.targets.map((target) => ({ ...target, selected: target.id === viewTargetId, progressPct: target.goal ? Math.min(100, Math.max(0, Math.round((target.points / target.goal) * 100))) : 0 }));
    const selectedTarget = encounter?.targets.find((target) => target.id === viewTargetId);
    const selectedActor = participants.find((actor) => actor.id === viewActorId);
    const pendingRequests = game.user.isGM ? encounter?.pendingRequests.filter((request) => request.status === "pending") ?? [] : [];
    return { ...context, encounter, participants, selectedTarget, selectedActor, pendingRequests, typeLabel: encounter ? TYPE_LABELS[encounter.type] : "", noEncounter: !encounter, isGM: game.user.isGM, canRequest: encounter?.status === "active" && !!selectedActor && !selectedActor.acted, showDC: game.user.isGM || encounter?.dcVisibility === "exact", hasUndo: game.user.isGM && !!encounter?.history.length };
  }
  static manage() { const encounter = Store.get(); if (encounter) new EncounterEditor(encounter).render({ force: true }); else manager.render({ force: true }); }
  static selectActor(_event, target) { viewActorId = target.dataset.id; this.render({ force: true }); }
  static selectTarget(_event, target) { viewTargetId = target.dataset.id; this.render({ force: true }); }
  static requestCheck(_event, target) {
    const encounter = Store.get();
    const actor = game.actors.get(viewActorId);
    const selectedTarget = encounter?.targets.find((entry) => entry.id === viewTargetId);
    const check = selectedTarget?.checks.find((entry) => entry.id === target.dataset.checkId);
    if (!encounter || !actor || !check || !canControlActor(actor) || encounter.actorsActed[actor.id]) return ui.notifications.warn("Choose an eligible character who has not acted.");
    const request = { action: "request", encounterId: encounter.id, userId: game.user.id, actorId: actor.id, targetId: selectedTarget.id, checkId: check.id };
    if (game.user.isGM) handlePlayerRequest(request);
    else game.socket.emit(SOCKET, request);
    ui.notifications.info(`Requested ${check.label} for ${actor.name}.`);
  }
  static async adjustPoints(_event, target) {
    const targetId = target.dataset.id;
    const delta = Number(target.dataset.delta) || 0;
    await mutateActive(`${delta >= 0 ? "Added" : "Removed"} ${Math.abs(delta)} point`, async (encounter) => {
      const entry = encounter.targets.find((item) => item.id === targetId);
      if (!entry) return;
      entry.points = Math.max(0, entry.points + delta);
      addLog(encounter, "points", `${entry.name}: ${delta >= 0 ? "+" : ""}${delta} point${Math.abs(delta) === 1 ? "" : "s"}.`, { targetId });
    });
  }
  static async nextRound() {
    await mutateActive("Advanced round", async (encounter) => {
      encounter.currentRound += 1;
      encounter.actorsActed = {};
      for (const request of encounter.pendingRequests) if (request.status === "pending") request.status = "cancelled";
      addLog(encounter, "round", `Advanced to round ${encounter.currentRound}.`);
    });
  }
  static async completeRequest(_event, target) {
    await mutateActive("Completed check request", async (encounter) => {
      const request = encounter.pendingRequests.find((entry) => entry.id === target.dataset.id);
      if (!request) return;
      request.status = "completed";
      request.completedAt = Date.now();
      encounter.actorsActed[request.actorId] = true;
      addLog(encounter, "action", `${request.actorName} completed ${request.checkLabel} against ${request.targetName}.`, request);
    });
  }
  static async cancelRequest(_event, target) {
    await mutateActive("Cancelled check request", async (encounter) => {
      const request = encounter.pendingRequests.find((entry) => entry.id === target.dataset.id);
      if (!request) return;
      request.status = "cancelled";
      addLog(encounter, "request", `Cancelled ${request.actorName}'s ${request.checkLabel} request.`, request);
    });
  }
  static async undo() { await undoActiveEncounter(); }
  static async pause() { await pauseEncounter(Store.activeId()); }
  static async end() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({ window: { title: "End & Publish" }, content: "<p>End this encounter and publish its summary and log to the Journal?</p>" });
    if (confirmed) await endEncounter(Store.activeId());
  }
}

let tracker;
let manager;
const SIDEBAR_TAB = `${MODULE_ID}-sidebar-tab`;

function activateEncounterSidebar() {
  const sidebar = document.getElementById("sidebar");
  const content = sidebar?.querySelector("#sidebar-content");
  if (!sidebar || !content) return;
  sidebar.querySelectorAll("#sidebar-tabs [data-tab]").forEach((button) => {
    const active = button.dataset.tab === SIDEBAR_TAB;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  content.querySelectorAll(":scope > .tab").forEach((section) => {
    const active = section.id === SIDEBAR_TAB;
    section.classList.toggle("active", active);
    section.hidden = !active;
  });
  content.classList.add("active-dnd5e-nce", "expanded");
}

function sidebarEncounterEntry(encounter, activeId) {
  const isCurrent = encounter.id === activeId;
  const statusIcon = encounter.status === "active" ? "fa-play" : encounter.status === "paused" ? "fa-pause" : "fa-file-pen";
  const primary = encounter.status === "active"
    ? '<button type="button" data-nce-action="open"><i class="fa-solid fa-up-right-from-square"></i> Open</button><button type="button" data-nce-action="pause"><i class="fa-solid fa-pause"></i> Pause</button>'
    : encounter.status === "paused"
      ? '<button type="button" data-nce-action="resume"><i class="fa-solid fa-play"></i> Resume</button>'
      : '<button type="button" data-nce-action="activate"><i class="fa-solid fa-play"></i> Activate</button>';
  return `<li class="dnd5e-nce-sidebar-entry ${isCurrent ? "current" : ""}" data-id="${esc(encounter.id)}">
    <img src="${esc(encounter.image)}" alt="">
    <div class="entry-summary"><strong>${esc(encounter.name)}</strong><span><i class="fa-solid ${statusIcon}"></i> ${esc(TYPE_LABELS[encounter.type])} — ${esc(encounter.status)}</span></div>
    <div class="entry-actions">${primary}<button type="button" data-nce-action="edit"><i class="fa-solid fa-pen-to-square"></i> Edit</button><button type="button" class="danger" data-nce-action="remove" aria-label="Delete ${esc(encounter.name)}" data-tooltip="Delete"><i class="fa-solid fa-trash"></i></button></div>
  </li>`;
}

async function handleEncounterSidebarAction(event) {
  const button = event.target.closest("[data-nce-action]");
  if (!button) return;
  const action = button.dataset.nceAction;
  const id = button.closest("[data-id]")?.dataset.id;
  if (action === "create") await createEncounter();
  else if (action === "edit") new EncounterEditor(Store.get(id)).render({ force: true });
  else if (action === "activate") await activateEncounter(id);
  else if (action === "pause") await pauseEncounter(id);
  else if (action === "resume") await resumeEncounter(id);
  else if (action === "open") tracker.render(true);
  else if (action === "remove") await deleteEncounter(id);
}

function renderEncounterSidebar() {
  const sidebar = document.getElementById("sidebar");
  const tabsMenu = sidebar?.querySelector("#sidebar-tabs > menu");
  const content = sidebar?.querySelector("#sidebar-content");
  if (!tabsMenu || !content) return;

  if (!tabsMenu.dataset.dnd5eNceBound) {
    tabsMenu.dataset.dnd5eNceBound = "true";
    tabsMenu.addEventListener("click", (event) => {
      const selected = event.target.closest("button[data-tab]")?.dataset.tab;
      if (!selected || selected === SIDEBAR_TAB) return;
      const panel = document.getElementById(SIDEBAR_TAB);
      if (panel) { panel.classList.remove("active"); panel.hidden = true; }
      tabsMenu.querySelector(`[data-tab="${SIDEBAR_TAB}"]`)?.classList.remove("active");
      content.classList.remove("active-dnd5e-nce");
      const selectedPanel = content.querySelector(`:scope > #${CSS.escape(selected)}`);
      selectedPanel?.classList.add("active");
      if (selectedPanel) selectedPanel.hidden = false;
    });
  }

  let tabButton = tabsMenu.querySelector(`[data-tab="${SIDEBAR_TAB}"]`);
  if (!tabButton) {
    const item = document.createElement("li");
    item.className = "dnd5e-nce-sidebar-tab-item";
    item.innerHTML = `<button type="button" class="ui-control plain icon fa-solid fa-people-group" data-tab="${SIDEBAR_TAB}" role="tab" aria-pressed="false" aria-label="Non-Combat Encounters" data-tooltip="Non-Combat Encounters"></button><div class="notification-pip"></div>`;
    tabButton = item.querySelector("button");
    tabButton.addEventListener("click", activateEncounterSidebar);
    const journalButton = tabsMenu.querySelector('[data-tab="journal"]');
    const journalItem = journalButton?.closest("li");
    if (journalItem) journalItem.after(item);
    else tabsMenu.append(item);
  }

  let panel = document.getElementById(SIDEBAR_TAB);
  if (!panel) {
    panel = document.createElement("section");
    panel.id = SIDEBAR_TAB;
    panel.className = "tab sidebar-tab flexcol dnd5e-nce-sidebar";
    panel.hidden = true;
    content.append(panel);
  }

  const encounters = Object.values(Store.all()).map(normalize).sort((a, b) => b.updatedAt - a.updatedAt);
  if (game.user.isGM) {
    panel.innerHTML = `<header class="dnd5e-nce-sidebar-header"><h2>Non-Combat Encounters</h2><button type="button" data-nce-action="create"><i class="fa-solid fa-file-circle-plus"></i> Create Encounter</button></header><ol class="dnd5e-nce-sidebar-list">${encounters.map((entry) => sidebarEncounterEntry(entry, Store.activeId())).join("") || '<li class="empty">No encounters created yet.</li>'}</ol>`;
  } else {
    const encounter = Store.get();
    panel.innerHTML = encounter
      ? `<header class="dnd5e-nce-sidebar-header"><h2>${esc(encounter.name)}</h2></header><div class="dnd5e-nce-sidebar-player"><img src="${esc(encounter.image)}" alt=""><p>${esc(TYPE_LABELS[encounter.type])} — ${esc(encounter.status)}</p><button type="button" data-nce-action="open"><i class="fa-solid fa-up-right-from-square"></i> Open Encounter</button></div>`
      : '<div class="dnd5e-nce-sidebar-player"><p>No active encounter.</p></div>';
  }
  panel.onclick = handleEncounterSidebarAction;
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.encounters, { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, SETTINGS.active, { scope: "world", config: false, type: String, default: "" });
});

Hooks.once("ready", async () => {
  tracker = new EncounterTracker();
  manager = new EncounterManager();
  game[MODULE_ID] = { open: () => tracker.render(true), manage: () => manager.render({ force: true }), Store };
  game.socket.on(SOCKET, handleSocketMessage);
  await migrateEncounters();
  renderEncounterSidebar();
  if (game.user.isGM) {
    const active = Store.get();
    if (active?.status === "active") tracker.render(true);
  } else game.socket.emit(SOCKET, { action: "request-sync", userId: game.user.id });
});

Hooks.on("nonCombatEncounterUpdated", () => { tracker?.render(false); manager?.render(false); renderEncounterSidebar(); });
Hooks.on("renderSidebar", renderEncounterSidebar);
Hooks.on("renderSceneControls", (_app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0]; const tools = root?.querySelector("#scene-controls-tools");
  if (!tools || tools.querySelector(".dnd5e-nce-control")) return;
  const item = document.createElement("li");
  item.innerHTML = '<button type="button" class="control ui-control tool icon fa-solid fa-people-group dnd5e-nce-control" aria-label="Non-Combat Encounters" data-tooltip="Non-Combat Encounters"></button>';
  item.querySelector("button").addEventListener("click", () => tracker.render(true)); tools.append(item);
});
