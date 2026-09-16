const MODULE_ID = "dnd5e-non-combat-encounters";
const SETTINGS = { encounters: "encounters", active: "activeEncounter" };
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

function newCheck() {
  return { id: randomID(), key: "skill:per", label: "Persuasion", dc: 15, guidance: "" };
}

function newTarget(type = "social") {
  const names = { social: "New NPC", research: "New Source", chase: "New Obstacle", exploration: "New Location", skill: "New Challenge" };
  return { id: randomID(), name: names[type], image: "icons/svg/mystery-man.svg", description: "", points: 0, goal: 4, checks: [newCheck()] };
}

function newEncounter() {
  const id = randomID();
  return {
    id, name: "New Non-Combat Encounter", type: "social", status: "draft",
    image: "icons/svg/d20-black.svg", description: "", participantIds: [],
    currentRound: 1, roundLimit: 0, targets: [newTarget("social")], createdAt: Date.now(), updatedAt: Date.now()
  };
}

function normalize(encounter) {
  encounter.type = TYPE_LABELS[encounter.type] ? encounter.type : "social";
  encounter.status = ["draft", "active", "paused"].includes(encounter.status) ? encounter.status : "draft";
  encounter.participantIds = Array.isArray(encounter.participantIds) ? encounter.participantIds : [];
  encounter.currentRound = Math.max(1, Number(encounter.currentRound) || 1);
  encounter.roundLimit = Math.max(0, Number(encounter.roundLimit) || 0);
  encounter.targets = Array.isArray(encounter.targets) ? encounter.targets : [];
  encounter.targets.forEach((target) => {
    target.id ||= randomID(); target.name ||= "New Target"; target.image ||= "icons/svg/mystery-man.svg";
    target.description ??= ""; target.points = Number(target.points) || 0; target.goal = Math.max(0, Number(target.goal) || 0);
    target.checks = Array.isArray(target.checks) ? target.checks : [];
    target.checks.forEach((check) => { check.id ||= randomID(); check.guidance ??= ""; check.dc = Math.max(0, Number(check.dc) || 0); });
  });
  return encounter;
}

const Store = {
  all() { return clone(game.settings.get(MODULE_ID, SETTINGS.encounters) ?? {}); },
  get(id = this.activeId()) { const encounter = this.all()[id]; return encounter ? normalize(encounter) : null; },
  activeId() { return game.settings.get(MODULE_ID, SETTINGS.active) || ""; },
  async save(encounter) {
    encounter.updatedAt = Date.now(); normalize(encounter);
    const records = this.all(); records[encounter.id] = encounter;
    await game.settings.set(MODULE_ID, SETTINGS.encounters, records);
    Hooks.callAll("nonCombatEncounterUpdated", encounter.id);
  },
  async remove(id) {
    const records = this.all(); delete records[id];
    await game.settings.set(MODULE_ID, SETTINGS.encounters, records);
    if (this.activeId() === id) await game.settings.set(MODULE_ID, SETTINGS.active, "");
    Hooks.callAll("nonCombatEncounterUpdated", id);
  },
  async setActive(id) { await game.settings.set(MODULE_ID, SETTINGS.active, id); Hooks.callAll("nonCombatEncounterUpdated", id); }
};

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
    return { ...context, isGM: game.user.isGM, encounters: Object.values(Store.all()).map(normalize).sort((a, b) => b.updatedAt - a.updatedAt).map((encounter) => ({ ...encounter, typeLabel: TYPE_LABELS[encounter.type], active: encounter.id === activeId })) };
  }
  static async create() { const encounter = newEncounter(); await Store.save(encounter); new EncounterEditor(encounter).render({ force: true }); this.render({ force: true }); }
  static edit(_event, target) { new EncounterEditor(Store.get(target.dataset.id)).render({ force: true }); }
  static async activate(_event, target) { const encounter = Store.get(target.dataset.id); encounter.status = "active"; await Store.save(encounter); await Store.setActive(encounter.id); tracker.render(true); this.render({ force: true }); }
  static async pause(_event, target) { const encounter = Store.get(target.dataset.id); encounter.status = "paused"; await Store.save(encounter); this.render({ force: true }); tracker.render(false); }
  static async resume(_event, target) { const encounter = Store.get(target.dataset.id); encounter.status = "active"; await Store.save(encounter); await Store.setActive(encounter.id); tracker.render(true); this.render({ force: true }); }
  static open() { tracker.render(true); }
  static async remove(_event, target) {
    if (!await foundry.applications.api.DialogV2.confirm({ window: { title: "Delete Encounter" }, content: "<p>Delete this encounter permanently?</p>" })) return;
    await Store.remove(target.dataset.id); this.render({ force: true }); tracker.render(false);
  }
}

class EncounterEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(encounter, options = {}) { super(options); this.encounter = clone(encounter); }
  static DEFAULT_OPTIONS = {
    id: "dnd5e-nce-editor", tag: "form", classes: ["dnd5e-nce", "standard-form"],
    position: { width: 820, height: 760 }, window: { icon: "fa-solid fa-pen-to-square", resizable: true },
    form: { closeOnSubmit: false, handler: EncounterEditor.submit },
    actions: { addTarget: EncounterEditor.addTarget, removeTarget: EncounterEditor.removeTarget, addCheck: EncounterEditor.addCheck, removeCheck: EncounterEditor.removeCheck }
  };
  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/editor.hbs`, root: true, scrollable: [".content"] } };
  get title() { return `Encounter: ${this.encounter.name}`; }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const selected = new Set(this.encounter.participantIds);
    const actors = game.actors.filter((actor) => actor.type === "character").map((actor) => ({ id: actor.id, name: actor.name, image: actor.img, selected: selected.has(actor.id) }));
    return { ...context, encounter: this.encounter, actors, typeLabels: TYPE_LABELS, checkChoices: Object.fromEntries(CHECK_CHOICES) };
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

class EncounterTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = { id: "dnd5e-nce-tracker", classes: ["dnd5e-nce"], position: { width: 680, height: 680 }, window: { title: "Non-Combat Encounter", icon: "fa-solid fa-people-group", resizable: true }, actions: { manage: EncounterTracker.manage } };
  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/tracker.hbs` } };
  async _prepareContext(options) {
    const context = await super._prepareContext(options); const encounter = Store.get();
    const participants = encounter?.participantIds.map((id) => game.actors.get(id)).filter(Boolean).map((actor) => ({ name: actor.name, image: actor.img })) ?? [];
    if (encounter) encounter.targets = encounter.targets.map((target) => ({ ...target, progressPct: target.goal ? Math.min(100, Math.max(0, Math.round((target.points / target.goal) * 100))) : 0 }));
    return { ...context, encounter, participants, typeLabel: encounter ? TYPE_LABELS[encounter.type] : "", noEncounter: !encounter, isGM: game.user.isGM };
  }
  static manage() { new EncounterManager().render({ force: true }); }
}

let tracker;
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.encounters, { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, SETTINGS.active, { scope: "world", config: false, type: String, default: "" });
});

Hooks.once("ready", () => {
  tracker = new EncounterTracker();
  game[MODULE_ID] = { open: () => tracker.render(true), manage: () => new EncounterManager().render({ force: true }), Store };
});

Hooks.on("nonCombatEncounterUpdated", () => tracker?.render(false));
Hooks.on("renderSceneControls", (_app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0]; const tools = root?.querySelector("#scene-controls-tools");
  if (!tools || tools.querySelector(".dnd5e-nce-control")) return;
  const item = document.createElement("li");
  item.innerHTML = '<button type="button" class="control ui-control tool icon fa-solid fa-people-group dnd5e-nce-control" aria-label="Non-Combat Encounters" data-tooltip="Non-Combat Encounters"></button>';
  item.querySelector("button").addEventListener("click", () => tracker.render(true)); tools.append(item);
});
