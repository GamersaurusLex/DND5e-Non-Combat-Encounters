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
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));

function indexedArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).sort(([a], [b]) => Number(a) - Number(b)).map(([, entry]) => entry);
}

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
  encounter.targets = indexedArray(encounter.targets);
  encounter.targets.forEach((target) => {
    target.id ||= randomID(); target.name ||= "New Target"; target.image ||= "icons/svg/mystery-man.svg";
    target.description ??= ""; target.points = Number(target.points) || 0; target.goal = Math.max(0, Number(target.goal) || 0);
    target.checks = indexedArray(target.checks);
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

async function createEncounter() {
  const encounter = newEncounter();
  await Store.save(encounter);
  new EncounterEditor(encounter).render({ force: true });
}

async function activateEncounter(id) {
  const encounter = Store.get(id);
  if (!encounter) return;
  encounter.status = "active";
  await Store.save(encounter);
  await Store.setActive(encounter.id);
  tracker.render(true);
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

async function deleteEncounter(id) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Delete Encounter" },
    content: "<p>Delete this encounter permanently?</p>"
  });
  if (!confirmed) return;
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
  static manage() { manager.render({ force: true }); }
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

Hooks.once("ready", () => {
  tracker = new EncounterTracker();
  manager = new EncounterManager();
  game[MODULE_ID] = { open: () => tracker.render(true), manage: () => manager.render({ force: true }), Store };
  renderEncounterSidebar();
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
