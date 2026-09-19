const MODULE_ID = "dnd5e-non-combat-encounters";
const SETTINGS = { encounters: "encounters", active: "activeEncounter" };
const SOCKET = `module.${MODULE_ID}`;
const SCHEMA_VERSION = 10;
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
const truthy = (value) => value === true || value === "true" || value === "on" || value === 1;
const checkLabelForKey = (key) => CHECK_CHOICES.find(([value]) => value === key)?.[1] ?? "Check";

function checkChoices() {
  const choices = [...CHECK_CHOICES];
  for (const key of Object.keys(CONFIG.DND5E.tools ?? {})) {
    const label = dnd5e.documents.Trait.keyLabel(key, { trait: "tool" }) ?? key;
    choices.push([`tool:${key}`, label]);
  }
  return choices;
}

function checkLabel(key) {
  return checkChoices().find(([value]) => value === key)?.[1] ?? checkLabelForKey(key);
}

function indexedArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).sort(([a], [b]) => Number(a) - Number(b)).map(([, entry]) => entry);
}

function newCheck() {
  return { id: randomID(), key: "skill:prc", label: "Perception", labelModified: false, dc: 15, guidance: "", successPoints: 1, criticalSuccessPoints: 2, failurePoints: 0, criticalFailurePoints: -1 };
}

function newSocialModifier(kind = "circumstance") {
  const labels = { weakness: "Weakness", resistance: "Resistance", circumstance: "New Circumstance" };
  return { id: randomID(), kind, label: labels[kind], description: "", effect: "bonus", value: kind === "weakness" ? 1 : kind === "resistance" ? -1 : 0, checkKey: "", conditional: kind !== "circumstance", active: kind === "circumstance", uses: 0, remaining: 0 };
}

function newReward(targetId = "") {
  return { id: randomID(), kind: "narrative", label: "New Reward", description: "", playerVisible: true, activation: "automatic", active: true, effect: "bonus", value: 1, targetId, checkKey: "", conditional: false, uses: 0, remaining: 0, applied: false, itemUuid: "", itemName: "", itemImage: "", currency: "gp" };
}

function newThreshold(targetId = "") {
  return { id: randomID(), points: 1, label: "New Threshold", text: "", rewards: [newReward(targetId)] };
}

function newTarget(type = "social") {
  const names = { social: "New NPC", research: "New Source", chase: "New Obstacle", exploration: "New Location", skill: "New Challenge" };
  const id = randomID();
  return { id, sourceUuid: "", sourceType: "", name: names[type], nickname: "", image: "icons/svg/mystery-man.svg", description: "", background: "", appearance: "", personality: "", gmNotes: "", playerNotes: "", points: 0, goal: type === "chase" ? 3 : 4, checks: [newCheck()], modifiers: [], thresholds: [newThreshold(id)], hidden: false, exhausted: false, availabilityByActor: {}, maxPointsByActor: {}, researchPointsByActor: {}, failureExhaustion: type === "chase" ? 1 : 0, criticalFailureExhaustion: type === "chase" ? 1 : 0 };
}

function newConsequenceOutcome(minimum = 0, label = "Consequence", text = "") {
  return { id: randomID(), minimum: Math.max(0, Number(minimum) || 0), label, text };
}

function newEncounter() {
  const id = randomID();
  return {
    id, name: "New Non-Combat Encounter", type: "social", status: "draft",
    schemaVersion: SCHEMA_VERSION, image: "icons/svg/d20-black.svg", backgroundImage: "", description: "", participantIds: [],
    currentRound: 1, roundLimit: 0, targets: [newTarget("social")], activeActorId: "", activeTargetId: "",
    actorsActed: {}, pendingRequests: [], log: [], history: [], dcVisibility: "hidden", criticalMode: "none", participantNicknames: {}, showProgressClocks: false, autoAdvance: true,
    research: { intervalHours: 4, pointMode: "shared" },
    chase: { resolution: "obstacle", quarryName: "The Quarry", quarryImage: "icons/svg/mystery-man.svg", quarryUuid: "", quarryPosition: 1, startPosition: 1, pace: 1, turnOrder: "before", scriptedQuarry: false, exhaustionMode: "2024", exhaustionByActor: {}, basePartySize: 4, partySize: 0, successes: 0, consequenceOutcomes: [newConsequenceOutcome(0, "Setback", "The chase ends with serious consequences."), newConsequenceOutcome(4, "Mixed Outcome", "The party succeeds, but at a cost."), newConsequenceOutcome(8, "Strong Outcome", "The party achieves an excellent result.")], concluded: false, outcome: "", victoryText: "You caught the quarry!", escapeText: "The quarry escaped.", conclusionText: "The chase concludes." },
    createdAt: Date.now(), updatedAt: Date.now()
  };
}

function normalize(encounter) {
  encounter.schemaVersion = SCHEMA_VERSION;
  encounter.type = TYPE_LABELS[encounter.type] ? encounter.type : "social";
  encounter.status = ["draft", "active", "paused", "ended"].includes(encounter.status) ? encounter.status : "draft";
  encounter.participantIds = Array.isArray(encounter.participantIds) ? encounter.participantIds : [];
  encounter.backgroundImage ??= "";
  encounter.currentRound = Math.max(1, Number(encounter.currentRound) || 1);
  encounter.roundLimit = Math.max(0, Number(encounter.roundLimit) || 0);
  encounter.activeActorId ??= "";
  encounter.activeTargetId ??= "";
  encounter.actorsActed = encounter.actorsActed && typeof encounter.actorsActed === "object" ? encounter.actorsActed : {};
  encounter.pendingRequests = indexedArray(encounter.pendingRequests);
  encounter.log = indexedArray(encounter.log);
  encounter.history = indexedArray(encounter.history);
  encounter.dcVisibility = ["hidden", "relative", "exact"].includes(encounter.dcVisibility) ? encounter.dcVisibility : "hidden";
  encounter.criticalMode = ["none", "margin5"].includes(encounter.criticalMode) ? encounter.criticalMode : "none";
  encounter.participantNicknames = encounter.participantNicknames && typeof encounter.participantNicknames === "object" ? encounter.participantNicknames : {};
  encounter.showProgressClocks = !!encounter.showProgressClocks;
  encounter.autoAdvance = encounter.autoAdvance !== false && encounter.autoAdvance !== "false";
  encounter.research = encounter.research && typeof encounter.research === "object" ? encounter.research : {};
  encounter.research.intervalHours = Math.max(1, Number(encounter.research.intervalHours) || 4);
  encounter.research.pointMode = encounter.research.pointMode === "individual" ? "individual" : "shared";
  encounter.chase = encounter.chase && typeof encounter.chase === "object" ? encounter.chase : {};
  encounter.chase.resolution = encounter.chase.resolution === "consequence" ? "consequence" : "obstacle";
  encounter.chase.quarryName ||= "The Quarry"; encounter.chase.quarryImage ||= "icons/svg/mystery-man.svg"; encounter.chase.quarryUuid ??= "";
  encounter.chase.startPosition = Math.max(0, Number(encounter.chase.startPosition) || 0);
  encounter.chase.quarryPosition = Math.max(0, Number(encounter.chase.quarryPosition ?? encounter.chase.startPosition) || 0);
  encounter.chase.partyPosition = Math.max(0, Number(encounter.chase.partyPosition) || 0);
  encounter.chase.pace = Math.max(0, Number(encounter.chase.pace) || 1);
  encounter.chase.successes = Math.max(0, Number(encounter.chase.successes) || 0);
  encounter.chase.consequenceOutcomes = indexedArray(encounter.chase.consequenceOutcomes);
  if (!encounter.chase.consequenceOutcomes.length) encounter.chase.consequenceOutcomes = [newConsequenceOutcome(0, "Consequence", encounter.chase.conclusionText || "The chase concludes.")];
  encounter.chase.consequenceOutcomes.forEach((outcome) => { outcome.id ||= randomID(); outcome.minimum = Math.max(0, Number(outcome.minimum) || 0); outcome.label ||= "Consequence"; outcome.text ??= ""; });
  encounter.chase.basePartySize = Math.max(1, Number(encounter.chase.basePartySize) || 4);
  encounter.chase.partySize = Math.max(0, Number(encounter.chase.partySize) || 0);
  encounter.chase.turnOrder = encounter.chase.turnOrder === "after" ? "after" : "before";
  encounter.chase.scriptedQuarry = truthy(encounter.chase.scriptedQuarry);
  encounter.chase.exhaustionMode = encounter.chase.exhaustionMode === "legacy" ? "legacy" : "2024";
  encounter.chase.exhaustionByActor = encounter.chase.exhaustionByActor && typeof encounter.chase.exhaustionByActor === "object" ? encounter.chase.exhaustionByActor : {};
  for (const [actorId, value] of Object.entries(encounter.chase.exhaustionByActor)) encounter.chase.exhaustionByActor[actorId] = Math.max(0, Math.min(5, Number(value) || 0));
  encounter.chase.concluded = truthy(encounter.chase.concluded); encounter.chase.outcome ??= ""; encounter.chase.victoryText ||= "You caught the quarry!"; encounter.chase.escapeText ||= "The quarry escaped."; encounter.chase.conclusionText ||= "The chase concludes.";
  encounter.targets = indexedArray(encounter.targets);
  encounter.targets.forEach((target) => {
    target.id ||= randomID(); target.name ||= "New Target"; target.image ||= "icons/svg/mystery-man.svg";
    target.sourceUuid ??= ""; target.sourceType ??= ""; target.nickname ??= ""; target.description ??= ""; target.background ??= ""; target.appearance ??= ""; target.personality ??= ""; target.gmNotes ??= ""; target.playerNotes ??= ""; target.points = Number(target.points) || 0; target.goal = Math.max(0, Number(target.goal) || 0);
    target.hidden = truthy(target.hidden); target.exhausted = truthy(target.exhausted);
    target.availabilityByActor = target.availabilityByActor && typeof target.availabilityByActor === "object" ? target.availabilityByActor : {};
    target.maxPointsByActor = target.maxPointsByActor && typeof target.maxPointsByActor === "object" ? target.maxPointsByActor : {};
    target.researchPointsByActor = target.researchPointsByActor && typeof target.researchPointsByActor === "object" ? target.researchPointsByActor : {};
    target.failureExhaustion = Math.max(0, Number(target.failureExhaustion) || 0); target.criticalFailureExhaustion = Math.max(0, Number(target.criticalFailureExhaustion) || 0);
    for (const [actorId, value] of Object.entries(target.maxPointsByActor)) target.maxPointsByActor[actorId] = Math.max(0, Number(value) || 0);
    for (const [actorId, value] of Object.entries(target.researchPointsByActor)) target.researchPointsByActor[actorId] = Math.max(0, Number(value) || 0);
    target.checks = indexedArray(target.checks);
    target.checks.forEach((check) => {
      check.id ||= randomID(); check.key ||= "skill:per"; check.label ||= checkLabel(check.key);
      if (check.labelModified == null) check.labelModified = !checkChoices().some(([, label]) => label === check.label);
      check.guidance ??= ""; check.dc = Math.max(0, Number(check.dc) || 0);
      check.successPoints = Number(check.successPoints ?? 1); check.criticalSuccessPoints = Number(check.criticalSuccessPoints ?? 2); check.failurePoints = Number(check.failurePoints ?? 0); check.criticalFailurePoints = Number(check.criticalFailurePoints ?? -1);
    });
    target.modifiers = indexedArray(target.modifiers);
    target.modifiers.forEach((modifier) => normalizeModifier(modifier));
    target.thresholds = indexedArray(target.thresholds);
    target.thresholds.forEach((threshold) => {
      threshold.id ||= randomID(); threshold.points = Number(threshold.points) || 0; threshold.label ||= "Threshold"; threshold.text ??= "";
      threshold.rewards = indexedArray(threshold.rewards ?? threshold.boons);
      threshold.rewards.forEach((reward) => normalizeReward(reward, target.id));
    });
  });
  if (!encounter.targets.some((target) => target.id === encounter.activeTargetId)) encounter.activeTargetId = encounter.targets[0]?.id ?? "";
  if (!encounter.participantIds.includes(encounter.activeActorId)) encounter.activeActorId = "";
  return encounter;
}

function normalizeModifier(modifier) {
  modifier.id ||= randomID(); modifier.kind = ["weakness", "resistance", "circumstance"].includes(modifier.kind) ? modifier.kind : "circumstance";
  modifier.label ||= "Modifier"; modifier.description ??= ""; modifier.effect = ["bonus", "dc", "advantage", "disadvantage"].includes(modifier.effect) ? modifier.effect : "bonus";
  modifier.value = Number(modifier.value) || 0; modifier.checkKey ??= ""; modifier.conditional = truthy(modifier.conditional); modifier.active = truthy(modifier.active);
  modifier.uses = Math.max(0, Number(modifier.uses) || 0); modifier.remaining = Math.max(0, Number(modifier.remaining ?? modifier.uses) || 0);
  return modifier;
}

function normalizeReward(reward, targetId = "") {
  reward.id ||= randomID(); reward.kind = ["narrative", "modifier", "points", "item", "currency"].includes(reward.kind) ? reward.kind : "narrative"; reward.label ||= "Reward"; reward.description ??= "";
  reward.playerVisible = reward.playerVisible !== false && reward.playerVisible !== "false"; reward.activation = reward.activation === "manual" ? "manual" : "automatic"; reward.active = reward.active == null ? reward.activation === "automatic" : truthy(reward.active);
  reward.effect = ["bonus", "dc", "advantage", "disadvantage"].includes(reward.effect) ? reward.effect : "bonus"; reward.value = Number(reward.value) || 0;
  reward.targetId ||= targetId; reward.checkKey ??= ""; reward.conditional = truthy(reward.conditional); reward.uses = Math.max(0, Number(reward.uses) || 0); reward.remaining = Math.max(0, Number(reward.remaining ?? reward.uses) || 0); reward.applied = truthy(reward.applied); reward.itemUuid ??= ""; reward.itemName ??= ""; reward.itemImage ??= ""; reward.currency = ["cp", "sp", "ep", "gp", "pp"].includes(reward.currency) ? reward.currency : "gp";
  return reward;
}

function participantActors(encounter) {
  return (encounter?.participantIds ?? []).map((id) => game.actors.get(id)).filter(Boolean);
}

function isResearch(encounter) { return encounter?.type === "research"; }
function isChase(encounter) { return encounter?.type === "chase"; }
function isConsequenceChase(encounter) { return isChase(encounter) && encounter?.chase?.resolution === "consequence"; }

function chasePartySize(encounter) {
  return Number(encounter?.chase?.partySize) || encounter?.participantIds?.length || Number(encounter?.chase?.basePartySize) || 4;
}

function chaseGoal(encounter, target) {
  if (!isChase(encounter)) return Math.max(0, Number(target?.goal) || 0);
  return Math.max(1, (Number(target?.goal) || 0) + chasePartySize(encounter) - (Number(encounter.chase.basePartySize) || 4));
}

function parseChecks(text) {
  const checks = [];
  const choices = new Map(checkChoices().map(([key, label]) => [label.toLowerCase(), key]));
  const matches = text.matchAll(/DC\s*(\d+)\s+([^,;\n]+?)(?=\s+to\s|\s*,\s*DC|\s*;|$)/gi);
  for (const match of matches) {
    for (const label of match[2].split(/\s+or\s+/i).map((entry) => entry.trim())) {
      const key = choices.get(label.toLowerCase());
      if (!key || checks.some((check) => check.key === key && check.dc === Number(match[1]))) continue;
      checks.push({ ...newCheck(), key, label: checkLabel(key), dc: Number(match[1]) });
    }
  }
  return checks;
}

function parseQuickTargets(text, type) {
  const header = /(?:^|\n)\s*([^\n]+?)\s+(?:OBSTACLE|CHALLENGE)\s*\d*\s*(?=\n|$)/gi;
  const starts = [...text.matchAll(header)];
  if (!starts.length) return [];
  return starts.map((match, index) => {
    const body = text.slice(match.index + match[0].length, starts[index + 1]?.index ?? text.length).trim();
    const target = newTarget(type);
    target.name = match[1].trim().replace(/\s+$/g, "");
    target.goal = Number(body.match(/(?:Chase|Victory|Skill)\s+Points?\s+(\d+)/i)?.[1]) || target.goal;
    const checks = parseChecks(body);
    if (checks.length) target.checks = checks;
    const description = body.replace(/(?:Chase|Victory|Skill)\s+Points?\s+\d+;?\s*/i, "").replace(/(?:Overcome|Check(?:s)?)\s+DC\s+[\s\S]*?(?=\n\s*\n|$)/i, "").replace(/\s+/g, " ").trim();
    if (description) target.description = description;
    return target;
  });
}

function chaseObstacle(encounter) {
  return encounter?.targets?.[Math.max(0, Number(encounter?.chase?.partyPosition) || 0)] ?? null;
}

function chaseExhaustion(encounter, actorId) {
  return Math.max(0, Math.min(5, Number(encounter?.chase?.exhaustionByActor?.[actorId]) || 0));
}

function isChaseDropout(encounter, actorId) { return chaseExhaustion(encounter, actorId) >= 5; }

function chaseExhaustionEffect(encounter, actor, check) {
  const level = chaseExhaustion(encounter, actor?.id);
  if (!isChase(encounter) || !level) return { bonus: 0, disadvantage: false, label: "" };
  if (encounter.chase.exhaustionMode === "legacy") {
    const { type } = parseCheckKey(check?.key);
    return { bonus: 0, disadvantage: ["ability", "skill", "tool"].includes(type), label: `Chase Exhaustion ${level}` };
  }
  return { bonus: -2 * level, disadvantage: false, label: `Chase Exhaustion ${level} (${signed(-2 * level)})` };
}

function resetChase(encounter) {
  if (!isChase(encounter)) return;
  encounter.chase.partyPosition = 0;
  encounter.chase.quarryPosition = isConsequenceChase(encounter) ? 0 : Math.min(encounter.targets.length, encounter.chase.startPosition);
  encounter.chase.successes = 0;
  encounter.chase.exhaustionByActor = {};
  encounter.chase.concluded = false;
  encounter.chase.outcome = "";
  encounter.activeTargetId = encounter.targets[0]?.id ?? "";
}

function advanceQuarry(encounter) {
  if (!isChase(encounter) || isConsequenceChase(encounter) || encounter.chase.concluded || !encounter.chase.pace) return false;
  const before = encounter.chase.quarryPosition;
  encounter.chase.quarryPosition = Math.min(encounter.targets.length, before + encounter.chase.pace);
  if (encounter.chase.quarryPosition !== before) addLog(encounter, "chase", `${encounter.chase.quarryName} moves ahead.`, { quarryPosition: encounter.chase.quarryPosition });
  return encounter.chase.quarryPosition !== before;
}

function consequenceOutcome(encounter) {
  return [...(encounter?.chase?.consequenceOutcomes ?? [])].sort((a, b) => b.minimum - a.minimum).find((entry) => encounter.chase.successes >= entry.minimum) ?? null;
}

function chaseOutcomeText(encounter, outcome) {
  if (outcome === "consequence") return consequenceOutcome(encounter)?.text || encounter.chase.conclusionText;
  return outcome === "victory" ? encounter.chase.victoryText : outcome === "escape" ? encounter.chase.escapeText : encounter.chase.conclusionText;
}

function concludeChase(encounter, outcome) {
  if (!isChase(encounter) || encounter.chase.concluded) return;
  encounter.chase.concluded = true;
  encounter.chase.outcome = outcome;
  const text = chaseOutcomeText(encounter, outcome);
  addLog(encounter, "chase", text, { outcome });
}

function advanceChaseRound(encounter) {
  if (!isChase(encounter) || encounter.chase.concluded) return;
  if (isConsequenceChase(encounter)) {
    if (encounter.chase.partyPosition >= encounter.targets.length - 1) {
      concludeChase(encounter, "consequence");
      return;
    }
    encounter.chase.partyPosition += 1;
    encounter.activeTargetId = chaseObstacle(encounter)?.id ?? "";
    encounter.currentRound += 1;
    encounter.actorsActed = {};
    for (const request of encounter.pendingRequests) if (request.status === "pending") request.status = "cancelled";
    addLog(encounter, "round", `Advanced to consequence phase ${encounter.currentRound}.`);
    return;
  }
  advanceQuarry(encounter);
  if (!encounter.chase.scriptedQuarry && encounter.chase.quarryPosition >= encounter.targets.length && encounter.chase.partyPosition < encounter.targets.length) concludeChase(encounter, "escape");
  encounter.currentRound += 1;
  encounter.actorsActed = {};
  for (const request of encounter.pendingRequests) if (request.status === "pending") request.status = "cancelled";
  addLog(encounter, "round", `Advanced to round ${encounter.currentRound}.`);
}

function eligibleRoundParticipants(encounter) {
  return (encounter?.participantIds ?? []).filter((actorId) => !isChase(encounter) || !isChaseDropout(encounter, actorId));
}

function allEligibleParticipantsActed(encounter) {
  const eligible = eligibleRoundParticipants(encounter);
  return eligible.length > 0 && eligible.every((actorId) => encounter.actorsActed[actorId]);
}

function advanceStandardRound(encounter) {
  encounter.currentRound += 1;
  encounter.actorsActed = {};
  for (const request of encounter.pendingRequests) if (request.status === "pending") request.status = "cancelled";
  addLog(encounter, "round", `Advanced to round ${encounter.currentRound}.`);
}

async function postChaseOutcome(encounter, outcome) {
  const text = chaseOutcomeText(encounter, outcome);
  const tone = outcome === "victory" ? "gained" : outcome === "escape" ? "lost" : "gained";
  await ChatMessage.create({ content: `<div class="dnd5e-nce-threshold ${tone}"><h3>${esc(encounter.name)}</h3><p>${esc(text)}</p></div>`, flags: { [MODULE_ID]: { encounterId: encounter.id, chaseOutcome: outcome } } });
}

async function postChaseUpdate(text, tone = "gained") {
  await ChatMessage.create({ content: `<div class="dnd5e-nce-threshold ${tone}"><h3>Chase Update</h3><p>${esc(text)}</p></div>` });
}

function researchPointsFor(target, actorId) {
  return Math.max(0, Number(target?.researchPointsByActor?.[actorId]) || 0);
}

function researchTotal(target) {
  return Object.values(target?.researchPointsByActor ?? {}).reduce((total, points) => total + Math.max(0, Number(points) || 0), 0);
}

function researchMaxFor(target, actorId) {
  return Math.max(0, Number(target?.maxPointsByActor?.[actorId]) || 0);
}

function researchSourceAvailable(target, actorId) {
  if (!target || target.hidden || target.exhausted || target.availabilityByActor?.[actorId] === false) return false;
  const maximum = researchMaxFor(target, actorId);
  return !maximum || researchPointsFor(target, actorId) < maximum;
}

function updateResearchExhaustion(encounter, target) {
  const participants = encounter.participantIds ?? [];
  const eligible = participants.filter((actorId) => target.availabilityByActor?.[actorId] !== false);
  if (!eligible.length) return;
  const capped = eligible.filter((actorId) => researchMaxFor(target, actorId) > 0);
  if (capped.length === eligible.length && capped.every((actorId) => researchPointsFor(target, actorId) >= researchMaxFor(target, actorId))) target.exhausted = true;
}

function canControlActor(actor, user = game.user) {
  return !!actor && (user?.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
}

function parseCheckKey(key = "") {
  const [type, id] = key.split(":", 2);
  return { type, id };
}

function actorCheckModifier(actor, key) {
  if (!actor) return null;
  const { type, id } = parseCheckKey(key);
  if (type === "skill") return Number(actor.system.skills?.[id]?.total ?? actor.system.skills?.[id]?.mod ?? 0);
  if (type === "tool") return Number(actor.system.tools?.[id]?.total ?? 0);
  if (type === "save") return Number(actor.system.abilities?.[id]?.save?.total ?? actor.system.abilities?.[id]?.save ?? 0);
  if (type === "ability") return Number(actor.system.abilities?.[id]?.check?.total ?? actor.system.abilities?.[id]?.mod ?? 0);
  return null;
}

function signed(value) {
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : ""}${number}`;
}

function degreeFor(total, dc, criticalMode) {
  if (criticalMode === "margin5" && total >= dc + 5) return { key: "criticalSuccess", label: "Critical Success" };
  if (total >= dc) return { key: "success", label: "Success" };
  if (criticalMode === "margin5" && total <= dc - 5) return { key: "criticalFailure", label: "Critical Failure" };
  return { key: "failure", label: "Failure" };
}

function displayName(record) {
  return String(record?.nickname ?? "").trim() || record?.name || "Unknown";
}

function rewardDetail(reward) {
  if (reward.kind === "item") return reward.itemName || reward.label;
  if (reward.kind === "currency") return `${Number(reward.value) || 0} ${reward.currency ?? "gp"}`;
  return reward.description ?? "";
}

function unlockedRewards(encounter) {
  return encounter.targets.flatMap((source) => source.thresholds.flatMap((threshold) => threshold.points <= source.points
    ? threshold.rewards.map((reward) => ({ ...reward, sourceTargetId: source.id, thresholdId: threshold.id })) : []));
}

function applicableModifiers(encounter, target, check) {
  const local = target.modifiers.filter((modifier) => (!modifier.checkKey || modifier.checkKey === check.key) && (!modifier.uses || modifier.remaining > 0));
  const rewards = unlockedRewards(encounter).filter((reward) => reward.kind === "modifier" && reward.active && (!reward.targetId || reward.targetId === target.id) && (!reward.checkKey || reward.checkKey === check.key) && (!reward.uses || reward.remaining > 0));
  return [...local, ...rewards.map((reward) => ({ ...reward, kind: "reward" }))];
}

function pointsForOutcome(check, outcome) {
  return Number(check?.[`${outcome}Points`] ?? ({ criticalSuccess: 2, success: 1, failure: 0, criticalFailure: -1 }[outcome]));
}

function crossedThresholds(target, previousPoints, currentPoints) {
  return target.thresholds.filter((threshold) => previousPoints < threshold.points && currentPoints >= threshold.points);
}

function lostThresholds(target, previousPoints, currentPoints) {
  return target.thresholds.filter((threshold) => previousPoints >= threshold.points && currentPoints < threshold.points);
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
  safe.targets = safe.targets.filter((target) => !target.hidden).map((target) => ({
    id: target.id, sourceUuid: target.sourceUuid, sourceType: target.sourceType, name: target.name, nickname: target.nickname, image: target.image,
    description: target.description, appearance: target.appearance, playerNotes: target.playerNotes, points: target.points, goal: target.goal,
    exhausted: !!target.exhausted, availabilityByActor: target.availabilityByActor, maxPointsByActor: target.maxPointsByActor, researchPointsByActor: target.researchPointsByActor,
    checks: target.checks.map((check) => ({
      id: check.id, key: check.key, label: check.label, guidance: check.guidance,
      ...(safe.dcVisibility === "exact" ? { dc: check.dc } : {})
    })),
    thresholds: target.thresholds.filter((threshold) => threshold.points <= target.points).map((threshold) => ({ id: threshold.id, points: threshold.points, label: threshold.label, text: threshold.text, rewards: threshold.rewards.filter((reward) => reward.playerVisible && reward.active).map((reward) => ({ id: reward.id, kind: reward.kind, label: reward.label, description: rewardDetail(reward), active: reward.active })) }))
  }));
  return safe;
}

function renderCinematicHud() {
  let hud = document.getElementById("dnd5e-nce-cinematic-hud");
  if (!hud) {
    hud = document.createElement("section");
    hud.id = "dnd5e-nce-cinematic-hud";
    document.body.append(hud);
  }
  const encounter = Store.get();
  if (!encounter || encounter.status !== "active") {
    hud.className = "";
    hud.replaceChildren();
    return;
  }
  const image = String(encounter.backgroundImage || encounter.image || "").trim();
  hud.className = "visible";
  const backdrop = document.createElement("div");
  backdrop.className = "dnd5e-nce-cinematic-backdrop";
  if (image) backdrop.style.backgroundImage = `url(${JSON.stringify(image)})`;
  hud.replaceChildren(backdrop);
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

async function createEncounter(event) {
  const content = document.createElement("div");
  content.innerHTML = await foundry.applications.handlebars.renderTemplate("templates/sidebar/document-create.html", {
    name: "",
    defaultName: "New Non-Combat Encounter",
    hasFolders: false,
    hasTypes: true,
    type: "social",
    types: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
    typeHint: ""
  });
  return foundry.applications.api.DialogV2.prompt({
    content,
    window: { title: "Create Encounter" },
    position: { width: 320, left: window.innerWidth - 630, top: event?.currentTarget?.offsetTop ?? 0 },
    ok: {
      label: "Create Encounter",
      callback: async (_event, button) => {
        const data = new foundry.applications.ux.FormDataExtended(button.form).object;
        const type = TYPE_LABELS[data.type] ? data.type : "social";
        const encounter = newEncounter();
        encounter.type = type;
        encounter.name = String(data.name ?? "").trim() || "New Non-Combat Encounter";
        encounter.targets = [newTarget(type)];
        normalize(encounter);
        new EncounterEditor(encounter).render({ force: true });
        return true;
      }
    }
  });
}

async function activateEncounter(id) {
  const encounter = Store.get(id);
  if (!encounter) return;
  if (isChase(encounter) && encounter.status !== "paused") resetChase(encounter);
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
  tracker.close();
}

async function resumeEncounter(id) {
  await activateEncounter(id);
}

function journalHtml(encounter) {
  const targets = encounter.targets.map((target) => {
    const thresholds = target.thresholds.filter((threshold) => threshold.points <= target.points).map((threshold) => `<li><strong>${esc(threshold.label)}</strong>${threshold.text ? ` — ${esc(threshold.text)}` : ""}${threshold.rewards.length ? `<ul>${threshold.rewards.map((reward) => `<li><strong>${esc(reward.label)}</strong>${rewardDetail(reward) ? ` — ${esc(rewardDetail(reward))}` : ""}</li>`).join("")}</ul>` : ""}</li>`).join("");
    const thresholdLabel = isResearch(encounter) ? "Discoveries" : "Unlocked Rewards";
    return `<section><h2>${esc(displayName(target))}</h2>${target.description ? `<p>${esc(target.description)}</p>` : ""}${target.background ? `<p><strong>Background:</strong> ${esc(target.background)}</p>` : ""}${target.appearance ? `<p><strong>Appearance:</strong> ${esc(target.appearance)}</p>` : ""}${target.personality ? `<p><strong>Personality:</strong> ${esc(target.personality)}</p>` : ""}<p><strong>Progress:</strong> ${target.points}${target.goal ? ` / ${target.goal}` : ""}</p>${thresholds ? `<h3>${thresholdLabel}</h3><ul>${thresholds}</ul>` : ""}</section>`;
  }).join("");
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
  if (isResearch(encounter) && !researchSourceAvailable(target, actor.id)) return;
  if (isChase(encounter) && (encounter.chase.concluded || target.id !== chaseObstacle(encounter)?.id || isChaseDropout(encounter, actor.id))) return;
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
    renderCinematicHud();
    tracker?.render(true);
  }
  if (message.action === "closed" && !game.user.isGM) {
    playerEncounterCache = null;
    renderCinematicHud();
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

function uniqueEncounterName(preferredName, suffix = "Copy") {
  const names = new Set(Object.values(Store.all()).map((entry) => String(entry.name).toLowerCase()));
  if (!names.has(preferredName.toLowerCase())) return preferredName;
  let name = `${preferredName} (${suffix})`;
  let number = 2;
  while (names.has(name.toLowerCase())) name = `${preferredName} (${suffix} ${number++})`;
  return name;
}

async function duplicateEncounterAsDraft(id) {
  const source = Store.get(id);
  if (!source) return;
  const duplicate = clone(source);
  Object.assign(duplicate, {
    id: randomID(), name: uniqueEncounterName(source.name), status: "draft", currentRound: 1,
    activeActorId: "", activeTargetId: "", actorsActed: {}, pendingRequests: [], log: [], history: []
  });
  duplicate.targets.forEach((target) => {
    target.points = 0;
    target.exhausted = false;
    target.researchPointsByActor = {};
    target.thresholds.forEach((threshold) => threshold.rewards.forEach((reward) => {
      reward.active = reward.activation !== "manual";
      reward.remaining = reward.uses;
      reward.applied = false;
    }));
  });
  resetChase(duplicate);
  normalize(duplicate);
  await Store.save(duplicate);
  renderEncounterSidebar();
  ui.notifications.info(`Created ${duplicate.name} as a draft.`);
}

function exportEncounterData(id) {
  const encounter = Store.get(id);
  if (!encounter) return ui.notifications.error("That encounter no longer exists.");
  saveDataToFile(JSON.stringify({ type: "dnd5e-non-combat-encounter", version: 1, encounter }, null, 2), "application/json", `${encounter.name.slugify() || "non-combat-encounter"}.json`);
}

function importEncounterData() {
  if (!game.user.isGM) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const source = parsed?.type === "dnd5e-non-combat-encounter" ? parsed.encounter : parsed;
      if (!source || typeof source !== "object" || Array.isArray(source) || typeof source.name !== "string") throw new Error("The selected file is not a Non-Combat Encounter export.");
      const imported = normalize(clone(source));
      Object.assign(imported, {
        id: randomID(), name: uniqueEncounterName(imported.name, "Imported"), status: "draft", currentRound: 1,
        activeActorId: "", activeTargetId: "", actorsActed: {}, pendingRequests: [], log: [], history: []
      });
      imported.targets.forEach((target) => {
        target.points = 0;
        target.exhausted = false;
        target.researchPointsByActor = {};
        target.thresholds.forEach((threshold) => threshold.rewards.forEach((reward) => {
          reward.active = reward.activation !== "manual";
          reward.remaining = reward.uses;
          reward.applied = false;
        }));
      });
      resetChase(imported);
      normalize(imported);
      await Store.save(imported);
      renderEncounterSidebar();
      ui.notifications.info(`Imported ${imported.name} as a draft.`);
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to import encounter`, error);
      ui.notifications.error(error.message || "Could not import that encounter file.");
    }
  }, { once: true });
  input.click();
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
  static async create(event) { if (await createEncounter(event)) this.render({ force: true }); }
  static edit(_event, target) { new EncounterEditor(Store.get(target.dataset.id)).render({ force: true }); }
  static async activate(_event, target) { await activateEncounter(target.dataset.id); this.render({ force: true }); }
  static async pause(_event, target) { await pauseEncounter(target.dataset.id); this.render({ force: true }); }
  static async resume(_event, target) { await resumeEncounter(target.dataset.id); this.render({ force: true }); }
  static open() { if (Store.get()?.status === "active") tracker.render(true); }
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
    actions: {
      addTarget: EncounterEditor.addTarget, removeTarget: EncounterEditor.removeTarget, addCheck: EncounterEditor.addCheck, removeCheck: EncounterEditor.removeCheck,
      addModifier: EncounterEditor.addModifier, removeModifier: EncounterEditor.removeModifier, addThreshold: EncounterEditor.addThreshold,
      removeThreshold: EncounterEditor.removeThreshold, addReward: EncounterEditor.addReward, removeReward: EncounterEditor.removeReward, parseTargets: EncounterEditor.parseTargets,
      addConsequence: EncounterEditor.addConsequence, removeConsequence: EncounterEditor.removeConsequence
    }
  };
  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/editor.hbs`, root: true, scrollable: [".content"] } };
  get title() { return `Encounter: ${this.encounter.name}`; }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const selected = new Set(this.encounter.participantIds);
    const actors = game.actors.filter((actor) => actor.type === "character").map((actor) => ({ id: actor.id, name: actor.name, image: actor.img, nickname: this.encounter.participantNicknames[actor.id] ?? "", selected: selected.has(actor.id) }));
    const dropLabels = { social: "targets", research: "sources", chase: "obstacles", exploration: "locations", skill: "challenges" };
    const addTargetLabels = { social: "Add Target", research: "Add Source", chase: "Add Obstacle", exploration: "Add Location", skill: "Add Challenge" };
    const removeTargetLabels = { social: "Remove Target", research: "Remove Source", chase: "Remove Obstacle", exploration: "Remove Location", skill: "Remove Challenge" };
    const editableEncounter = clone(this.encounter);
    const consequenceMode = isConsequenceChase(this.encounter);
    if (editableEncounter.type === "chase") editableEncounter.targets.forEach((target) => { target.adjustedGoal = chaseGoal(editableEncounter, target); });
    if (editableEncounter.type === "research") editableEncounter.targets.forEach((target) => {
      target.researchRows = actors.filter((actor) => actor.selected).map((actor) => ({ id: actor.id, name: actor.name, available: target.availabilityByActor?.[actor.id] !== false, maximum: researchMaxFor(target, actor.id), earned: researchPointsFor(target, actor.id) }));
    });
    const headings = { social: "Influence Targets", research: "Research Sources", chase: "Chase Obstacles", exploration: "Exploration Locations", skill: "Skill Challenges" };
    return {
      ...context, encounter: editableEncounter, actors, isSocial: this.encounter.type === "social", isResearch: this.encounter.type === "research", isChase: this.encounter.type === "chase", isConsequenceChase: consequenceMode, isQuickParse: ["chase", "skill"].includes(this.encounter.type), isPointEncounter: ["social", "research", "skill", "chase"].includes(this.encounter.type), typeLabels: TYPE_LABELS,
      checkChoices: Object.fromEntries(checkChoices()), checkChoicesWithAll: Object.fromEntries([["", "All checks"], ...checkChoices()]),
      targetChoices: Object.fromEntries([["", "This target"], ...this.encounter.targets.map((target) => [target.id, displayName(target)])]),
      dcVisibilities: { hidden: "Hidden", relative: "Relative difficulty", exact: "Exact DCs" }, criticalModes: { none: "No automatic critical results", margin5: "Critical success/failure at DC ±5" },
      modifierKinds: { weakness: "Weakness", resistance: "Resistance", circumstance: "Circumstance" }, modifierEffects: { bonus: "Roll bonus/penalty", dc: "DC adjustment", advantage: "Advantage", disadvantage: "Disadvantage" },
      rewardKinds: { narrative: "Narrative reward", item: "Item reward", currency: "Currency reward", modifier: "Mechanical modifier", points: "Points against a target" }, rewardActivations: { automatic: "Automatic", manual: "GM activates" }, currencies: { cp: "Copper (cp)", sp: "Silver (sp)", ep: "Electrum (ep)", gp: "Gold (gp)", pp: "Platinum (pp)" }, dropLabel: dropLabels[this.encounter.type], addTargetLabel: addTargetLabels[this.encounter.type], removeTargetLabel: removeTargetLabels[this.encounter.type], elementHeading: headings[this.encounter.type], researchPointModes: { shared: "Shared source progress", individual: "Track each character's RP" }, chaseResolutions: { obstacle: "Obstacle Chase — clear each obstacle with Chase Points", consequence: "Consequence Chase — everyone checks once per phase" }, chaseTurnOrders: { before: "Quarry acts before the party", after: "Quarry acts after the party" }, exhaustionModes: { "2024": "2024 Exhaustion (−2 per level to d20 Tests)", legacy: "Optional legacy Exhaustion" }, dcReference: [{ label: "Very Easy", dc: 5 }, { label: "Easy", dc: 10 }, { label: "Medium", dc: 15 }, { label: "Hard", dc: 20 }, { label: "Very Hard", dc: 25 }, { label: "Nearly Impossible", dc: 30 }], chasePartySize: chasePartySize(this.encounter)
    };
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
    for (const rewardZone of this.element.querySelectorAll("[data-reward-drop-zone]")) {
      rewardZone.addEventListener("dragenter", (event) => { event.preventDefault(); rewardZone.classList.add("dragover"); });
      rewardZone.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; rewardZone.classList.add("dragover"); });
      rewardZone.addEventListener("dragleave", (event) => { if (!rewardZone.contains(event.relatedTarget)) rewardZone.classList.remove("dragover"); });
      rewardZone.addEventListener("drop", (event) => this._onRewardDrop(event));
    }
    for (const row of this.element.querySelectorAll(".nce-check-row")) {
      const select = row.querySelector('select[name$=".key"]');
      const label = row.querySelector('input[name$=".label"]');
      const modified = row.querySelector('input[name$=".labelModified"]');
      if (label && select && modified?.value !== "true") label.value = select.selectedOptions[0]?.textContent?.trim() || checkLabelForKey(select.value);
      select?.addEventListener("change", () => {
        if (!label || modified?.value === "true") return;
        label.value = select.selectedOptions[0]?.textContent?.trim() || checkLabel(select.value);
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
  async _onRewardDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("dragover");
    let data = {};
    try { data = TextEditor.getDragEventData(event); }
    catch (_error) { try { data = JSON.parse(event.dataTransfer?.getData("text/plain") || "{}"); } catch (_parseError) { return; } }
    let item = data.uuid ? await fromUuid(data.uuid) : null;
    if (!item && data.itemId) item = game.items.get(data.itemId);
    if (!item || item.documentName !== "Item") return ui.notifications.warn("Drop an Item from the Foundry Items directory.");
    this._capture();
    const targetIndex = Number(event.currentTarget.dataset.targetIndex);
    const thresholdIndex = Number(event.currentTarget.dataset.thresholdIndex);
    const rewardIndex = Number(event.currentTarget.dataset.rewardIndex);
    const reward = this.encounter.targets[targetIndex]?.thresholds[thresholdIndex]?.rewards[rewardIndex];
    if (!reward) return;
    reward.kind = "item";
    reward.itemUuid = item.uuid ?? "";
    reward.itemName = item.name ?? "Item";
    reward.itemImage = item.img ?? "";
    reward.label = item.name ?? reward.label;
    ui.notifications.info(`Linked ${reward.itemName} as a reward.`);
    await this.render({ force: true });
  }
  _capture() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    foundry.utils.mergeObject(this.encounter, foundry.utils.expandObject(data), { inplace: true, overwrite: true });
    normalize(this.encounter);
    this.encounter.participantIds = [...this.element.querySelectorAll('[name="participantIds"]:checked')].map((input) => input.value);
    for (const actor of game.actors.filter((entry) => entry.type === "character")) this.encounter.participantNicknames[actor.id] = this.element.querySelector(`[name="participantNicknames.${actor.id}"]`)?.value.trim() ?? "";
    this.encounter.showProgressClocks = this.element.querySelector('[name="showProgressClocks"]')?.checked ?? false;
    this.encounter.autoAdvance = isConsequenceChase(this.encounter) || (this.element.querySelector('[name="autoAdvance"]')?.checked ?? true);
    if (this.encounter.type === "chase") this.encounter.chase.scriptedQuarry = this.element.querySelector('[name="chase.scriptedQuarry"]')?.checked ?? false;
    this._captureTargetOptions();
    normalize(this.encounter);
  }
  _captureTargetOptions() {
    this.encounter.targets.forEach((target, targetIndex) => {
      target.modifiers.forEach((modifier, modifierIndex) => {
        modifier.conditional = this.element.querySelector(`[name="targets.${targetIndex}.modifiers.${modifierIndex}.conditional"]`)?.checked ?? false;
        modifier.active = this.element.querySelector(`[name="targets.${targetIndex}.modifiers.${modifierIndex}.active"]`)?.checked ?? false;
      });
      target.thresholds.forEach((threshold, thresholdIndex) => threshold.rewards.forEach((reward, rewardIndex) => {
        reward.playerVisible = this.element.querySelector(`[name="targets.${targetIndex}.thresholds.${thresholdIndex}.rewards.${rewardIndex}.playerVisible"]`)?.checked ?? false;
        reward.conditional = this.element.querySelector(`[name="targets.${targetIndex}.thresholds.${thresholdIndex}.rewards.${rewardIndex}.conditional"]`)?.checked ?? false;
      }));
      if (this.encounter.type === "research") {
        target.hidden = this.element.querySelector(`[name="targets.${targetIndex}.hidden"]`)?.checked ?? false;
        target.exhausted = this.element.querySelector(`[name="targets.${targetIndex}.exhausted"]`)?.checked ?? false;
        for (const actorId of this.encounter.participantIds) {
        const availabilityInput = this.element.querySelector(`[name="targets.${targetIndex}.availabilityByActor.${actorId}"]`);
        const maximumInput = this.element.querySelector(`[name="targets.${targetIndex}.maxPointsByActor.${actorId}"]`);
        if (availabilityInput) target.availabilityByActor[actorId] = availabilityInput.checked;
        else if (target.availabilityByActor[actorId] == null) target.availabilityByActor[actorId] = true;
        if (maximumInput) target.maxPointsByActor[actorId] = Math.max(0, Number(maximumInput.value) || 0);
        }
      }
    });
  }
  static async submit(_event, _form, formData) {
    const previousType = this.encounter.type;
    const previousChaseResolution = this.encounter.chase?.resolution;
    foundry.utils.mergeObject(this.encounter, foundry.utils.expandObject(formData.object), { inplace: true, overwrite: true });
    normalize(this.encounter);
    if (previousType !== this.encounter.type) {
      const defaultNames = { social: "New NPC", research: "New Source", chase: "New Obstacle", exploration: "New Location", skill: "New Challenge" };
      for (const target of this.encounter.targets) if (target.name === defaultNames[previousType]) target.name = defaultNames[this.encounter.type];
    }
    if (this.encounter.type === "chase" && previousChaseResolution !== this.encounter.chase.resolution) resetChase(this.encounter);
    this.encounter.participantIds = [...this.element.querySelectorAll('[name="participantIds"]:checked')].map((input) => input.value);
    for (const actor of game.actors.filter((entry) => entry.type === "character")) this.encounter.participantNicknames[actor.id] = this.element.querySelector(`[name="participantNicknames.${actor.id}"]`)?.value.trim() ?? "";
    this.encounter.showProgressClocks = this.element.querySelector('[name="showProgressClocks"]')?.checked ?? false;
    this.encounter.autoAdvance = isConsequenceChase(this.encounter) || (this.element.querySelector('[name="autoAdvance"]')?.checked ?? true);
    if (this.encounter.type === "chase") this.encounter.chase.scriptedQuarry = this.element.querySelector('[name="chase.scriptedQuarry"]')?.checked ?? false;
    this._captureTargetOptions();
    normalize(this.encounter);
    await Store.save(this.encounter); ui.notifications.info("Encounter saved."); await this.render({ force: true });
  }
  static async addTarget() { this._capture(); this.encounter.targets.push(newTarget(this.encounter.type)); await this.render({ force: true }); }
  static async addConsequence() { this._capture(); this.encounter.chase.consequenceOutcomes.push(newConsequenceOutcome(0, "Consequence", "")); await this.render({ force: true }); }
  static async removeConsequence(_event, target) { this._capture(); this.encounter.chase.consequenceOutcomes.splice(Number(target.dataset.index), 1); if (!this.encounter.chase.consequenceOutcomes.length) this.encounter.chase.consequenceOutcomes.push(newConsequenceOutcome(0, "Consequence", "")); await this.render({ force: true }); }
  static async parseTargets() {
    this._capture();
    const source = this.element.querySelector('[name="quickParse"]')?.value ?? "";
    const parsed = parseQuickTargets(source, this.encounter.type);
    if (!parsed.length) return ui.notifications.warn("No obstacle or challenge headings were found. Use headings such as ‘CROWDED MARKET OBSTACLE 5’. ");
    this.encounter.targets = parsed;
    delete this.encounter.quickParse;
    ui.notifications.info(`Created ${parsed.length} ${this.encounter.type === "chase" ? "obstacle" : "challenge"}${parsed.length === 1 ? "" : "s"}.`);
    await this.render({ force: true });
  }
  static async removeTarget(_event, target) { this._capture(); this.encounter.targets.splice(Number(target.dataset.index), 1); await this.render({ force: true }); }
  static async addCheck(_event, target) { this._capture(); this.encounter.targets[Number(target.dataset.targetIndex)]?.checks.push(newCheck()); await this.render({ force: true }); }
  static async removeCheck(_event, target) { this._capture(); this.encounter.targets[Number(target.dataset.targetIndex)]?.checks.splice(Number(target.dataset.index), 1); await this.render({ force: true }); }
  static async addModifier(_event, target) { this._capture(); this.encounter.targets[Number(target.dataset.targetIndex)]?.modifiers.push(newSocialModifier(target.dataset.kind)); await this.render({ force: true }); }
  static async removeModifier(_event, target) { this._capture(); this.encounter.targets[Number(target.dataset.targetIndex)]?.modifiers.splice(Number(target.dataset.index), 1); await this.render({ force: true }); }
  static async addThreshold(_event, target) { this._capture(); const entry = this.encounter.targets[Number(target.dataset.targetIndex)]; if (entry) entry.thresholds.push(newThreshold(entry.id)); await this.render({ force: true }); }
  static async removeThreshold(_event, target) { this._capture(); this.encounter.targets[Number(target.dataset.targetIndex)]?.thresholds.splice(Number(target.dataset.index), 1); await this.render({ force: true }); }
  static async addReward(_event, target) { this._capture(); const entry = this.encounter.targets[Number(target.dataset.targetIndex)]; entry?.thresholds[Number(target.dataset.thresholdIndex)]?.rewards.push(newReward(entry.id)); await this.render({ force: true }); }
  static async removeReward(_event, target) { this._capture(); this.encounter.targets[Number(target.dataset.targetIndex)]?.thresholds[Number(target.dataset.thresholdIndex)]?.rewards.splice(Number(target.dataset.index), 1); await this.render({ force: true }); }
}

let viewActorId = "";
let viewTargetId = "";

class RollConfirmation extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(data, options = {}) {
    super(options);
    this.data = data;
    this.promise = new Promise((resolve) => { this.resolve = resolve; });
  }
  static DEFAULT_OPTIONS = {
    id: "dnd5e-nce-roll-confirmation", tag: "form", classes: ["dnd5e-nce"],
    position: { width: 480, height: "auto" }, window: { title: "Confirm Check", icon: "fa-solid fa-dice-d20", resizable: false },
    actions: { normal: RollConfirmation.normal, advantage: RollConfirmation.advantage, disadvantage: RollConfirmation.disadvantage }
  };
  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/roll-confirmation.hbs`, root: true } };
  async _prepareContext(options) { return { ...(await super._prepareContext(options)), ...this.data }; }
  _choice(mode) {
    const form = new foundry.applications.ux.FormDataExtended(this.element).object;
    const modifierIds = [...this.element.querySelectorAll('[name="modifierIds"]:checked')].map((input) => input.value);
    this.resolve({ mode, bonus: Number(form.bonus) || 0, dcAdjust: Number(form.dcAdjust) || 0, bonusNote: String(form.bonusNote ?? "").trim(), rollMode: form.rollMode || "publicroll", modifierIds });
    this.resolve = () => {};
    this.close();
  }
  static normal() { this._choice("normal"); }
  static advantage() { this._choice("advantage"); }
  static disadvantage() { this._choice("disadvantage"); }
  async close(options = {}) {
    this.resolve?.(null);
    this.resolve = () => {};
    return super.close(options);
  }
}

async function confirmRoll(data) {
  const dialog = new RollConfirmation(data);
  dialog.render({ force: true });
  return dialog.promise;
}

async function rollRequestedCheck(request, encounter, choice) {
  const actor = game.actors.get(request.actorId);
  const target = encounter.targets.find((entry) => entry.id === request.targetId);
  const check = target?.checks.find((entry) => entry.id === request.checkId);
  if (!actor || !target || !check) throw new Error("The requested actor, target, or check is no longer available.");
  const { type, id } = parseCheckKey(check.key);
  const selectedModifiers = applicableModifiers(encounter, target, check).filter((modifier) => choice.modifierIds.includes(modifier.id));
  const exhaustion = chaseExhaustionEffect(encounter, actor, check);
  const advantageEffects = selectedModifiers.filter((modifier) => modifier.effect === "advantage").length;
  const disadvantageEffects = selectedModifiers.filter((modifier) => modifier.effect === "disadvantage").length;
  let mode = choice.mode;
  if (mode === "normal" && (advantageEffects !== disadvantageEffects || exhaustion.disadvantage)) mode = (advantageEffects > disadvantageEffects && !exhaustion.disadvantage) ? "advantage" : "disadvantage";
  const advantageModes = CONFIG.Dice.D20Roll.ADV_MODE;
  const advantageMode = mode === "advantage" ? advantageModes.ADVANTAGE : mode === "disadvantage" ? advantageModes.DISADVANTAGE : advantageModes.NORMAL;
  const bonus = (Number(choice.bonus) || 0) + exhaustion.bonus + selectedModifiers.filter((modifier) => modifier.effect === "bonus").reduce((sum, modifier) => sum + Number(modifier.value), 0);
  const effectiveDc = Math.max(0, check.dc + (Number(choice.dcAdjust) || 0) + selectedModifiers.filter((modifier) => modifier.effect === "dc").reduce((sum, modifier) => sum + Number(modifier.value), 0));
  const config = { ability: id, target: effectiveDc, advantageMode };
  if (["skill", "tool"].includes(type)) config.bonus = String(bonus);
  else if (bonus) config.rolls = [{ parts: ["@nceBonus"], data: { nceBonus: bonus }, options: {} }];
  const dialog = { configure: false };
  const message = {
    rollMode: choice.rollMode,
    data: {
      flavor: `${esc(actor.name)} — ${esc(check.label)} against ${esc(target.name)}`,
      flags: { [MODULE_ID]: { encounterId: encounter.id, requestId: request.id, dc: effectiveDc } }
    }
  };
  let rolls;
  if (type === "skill") rolls = await actor.rollSkill({ ...config, skill: id }, dialog, message);
  else if (type === "tool") rolls = await actor.rollToolCheck({ ...config, tool: id }, dialog, message);
  else if (type === "save") rolls = await actor.rollSavingThrow(config, dialog, message);
  else rolls = await actor.rollAbilityCheck(config, dialog, message);
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return null;
  const total = Number(roll.total);
  return { total, degree: degreeFor(total, effectiveDc, encounter.criticalMode), actor, target, check, bonus, effectiveDc, selectedModifiers, mode, exhaustion };
}

async function postResultCard(encounter, result, choice) {
  const whisper = choice.rollMode === "publicroll" ? [] : ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
  const hiddenNumbers = choice.rollMode !== "publicroll" || encounter.dcVisibility === "hidden";
  const detail = hiddenNumbers ? result.degree.label : `${result.degree.label} — ${result.total} vs. DC ${result.effectiveDc}`;
  const bonusText = result.bonus ? `<p>Situational modifier: ${signed(result.bonus)}${choice.bonusNote ? ` — ${esc(choice.bonusNote)}` : ""}</p>` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: result.actor }), whisper,
    content: `<div class="dnd5e-nce-chat-result ${result.degree.key}"><h3>${esc(result.actor.name)} — ${esc(result.check.label)}</h3><p><strong>${esc(detail)}</strong> against ${esc(result.target.name)}.</p>${bonusText}</div>`,
    flags: { [MODULE_ID]: { encounterId: encounter.id, outcome: result.degree.key } }
  });
}

async function postThresholdCards(target, gained, lost) {
  for (const threshold of gained) {
    const rewards = threshold.rewards.filter((reward) => reward.playerVisible && reward.active);
    await ChatMessage.create({ content: `<div class="dnd5e-nce-threshold gained"><h3>${esc(displayName(target))}: ${esc(threshold.label)}</h3><p>${esc(threshold.text)}</p>${rewards.length ? `<ul>${rewards.map((reward) => `<li><strong>${esc(reward.label)}</strong>${rewardDetail(reward) ? ` — ${esc(rewardDetail(reward))}` : ""}</li>`).join("")}</ul>` : ""}</div>` });
  }
  for (const threshold of lost) await ChatMessage.create({ content: `<div class="dnd5e-nce-threshold lost"><h3>Reward Lost: ${esc(threshold.label)}</h3><p>${esc(displayName(target))}'s progress fell below ${threshold.points} points.</p></div>` });
}

class EncounterTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dnd5e-nce-tracker", classes: ["dnd5e-nce"], position: { width: 760, height: 760 },
    window: { title: "Non-Combat Encounter", icon: "fa-solid fa-people-group", resizable: true },
    actions: {
      manage: EncounterTracker.manage, selectActor: EncounterTracker.selectActor, selectTarget: EncounterTracker.selectTarget,
      requestCheck: EncounterTracker.requestCheck, adjustPoints: EncounterTracker.adjustPoints, adjustResearchPoints: EncounterTracker.adjustResearchPoints, nextRound: EncounterTracker.nextRound,
      completeRequest: EncounterTracker.completeRequest, cancelRequest: EncounterTracker.cancelRequest,
      toggleReward: EncounterTracker.toggleReward, applyReward: EncounterTracker.applyReward,
      undo: EncounterTracker.undo, pause: EncounterTracker.pause, end: EncounterTracker.end,
      concludeChase: EncounterTracker.concludeChase
    }
  };
  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/tracker.hbs`, root: true, scrollable: [".nce-tracker"] } };
  async _onRender(context, options) {
    await super._onRender(context, options);
    const windowContent = this.element.closest(".application")?.querySelector(".window-content");
    if (!windowContent) return;
    windowContent.style.setProperty("min-height", "0");
    windowContent.style.setProperty("overflow-y", "auto", "important");
  }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const encounter = Store.get();
    const owned = encounter ? participantActors(encounter).filter((actor) => canControlActor(actor)) : [];
    if (encounter && !owned.some((actor) => actor.id === viewActorId)) viewActorId = owned[0]?.id ?? "";
    if (isChase(encounter)) viewTargetId = chaseObstacle(encounter)?.id ?? "";
    if (encounter && !encounter.targets.some((target) => target.id === viewTargetId)) viewTargetId = encounter.activeTargetId || encounter.targets[0]?.id || "";
    const participants = encounter ? participantActors(encounter).map((actor) => ({ id: actor.id, name: actor.name, displayName: encounter.participantNicknames[actor.id]?.trim() || actor.name, image: actor.img, owned: canControlActor(actor), acted: !!encounter.actorsActed[actor.id], selected: actor.id === viewActorId, researchTotal: encounter.targets.reduce((sum, source) => sum + researchPointsFor(source, actor.id), 0), exhaustion: chaseExhaustion(encounter, actor.id), droppedOut: isChaseDropout(encounter, actor.id) })) : [];
    if (encounter) {
      const visibleTargets = !game.user.isGM && isResearch(encounter) ? encounter.targets.filter((target) => owned.some((actor) => researchSourceAvailable(target, actor.id))) : encounter.targets;
      encounter.targets = visibleTargets.map((target, index) => { const effectiveGoal = isConsequenceChase(encounter) ? 0 : chaseGoal(encounter, target); return { ...target, displayName: displayName(target), selected: target.id === viewTargetId, effectiveGoal, progressPct: effectiveGoal ? Math.min(100, Math.max(0, Math.round((target.points / effectiveGoal) * 100))) : 0, sourceAvailable: !isResearch(encounter) || (!!viewActorId && researchSourceAvailable(target, viewActorId)), selectedActorPoints: researchPointsFor(target, viewActorId), selectedActorMaximum: researchMaxFor(target, viewActorId), researchRows: participants.map((actor) => ({ ...actor, sourcePoints: researchPointsFor(target, actor.id), sourceMaximum: researchMaxFor(target, actor.id), available: researchSourceAvailable(target, actor.id) })), obstacleIndex: index + 1, obstacleCurrent: isChase(encounter) && index === encounter.chase.partyPosition, obstacleCompleted: isChase(encounter) && index < encounter.chase.partyPosition, obstacleQuarry: !isConsequenceChase(encounter) && isChase(encounter) && index === encounter.chase.quarryPosition, unlockedThresholds: target.thresholds.filter((threshold) => threshold.points <= target.points).map((threshold) => ({ ...threshold, rewards: threshold.rewards.filter((reward) => game.user.isGM || (reward.playerVisible && reward.active)).map((reward) => ({ ...reward, description: rewardDetail(reward) })) })) }; });
    }
    const selectedTarget = encounter?.targets.find((target) => target.id === viewTargetId);
    const selectedActor = participants.find((actor) => actor.id === viewActorId);
    if (selectedTarget && selectedActor) selectedTarget.checks = selectedTarget.checks.map((check) => ({ ...check, actorModifier: signed(actorCheckModifier(game.actors.get(selectedActor.id), check.key)) }));
    const pendingRequests = game.user.isGM ? encounter?.pendingRequests.filter((request) => request.status === "pending").map((request) => {
      const requestTarget = encounter.targets.find((entry) => entry.id === request.targetId);
      const requestCheck = requestTarget?.checks.find((entry) => entry.id === request.checkId);
      return { ...request, modifier: signed(actorCheckModifier(game.actors.get(request.actorId), requestCheck?.key)) };
    }) ?? [] : [];
    const canChase = !isChase(encounter) || (!encounter.chase.concluded && !!selectedTarget?.obstacleCurrent && !!selectedActor && !selectedActor.droppedOut);
    return { ...context, encounter, participants, selectedTarget, selectedActor, pendingRequests, typeLabel: encounter ? TYPE_LABELS[encounter.type] : "", noEncounter: !encounter, isGM: game.user.isGM, isResearch: isResearch(encounter), isChase: isChase(encounter), isConsequenceChase: isConsequenceChase(encounter), consequenceOutcome: consequenceOutcome(encounter), canRequest: encounter?.status === "active" && !!selectedActor && !selectedActor.acted && (!isResearch(encounter) || !!selectedTarget?.sourceAvailable) && canChase, showDC: game.user.isGM || encounter?.dcVisibility === "exact", hasUndo: game.user.isGM && !!encounter?.history.length, chaseQuarryPosition: isChase(encounter) ? encounter.chase.quarryPosition + 1 : 0, chasePhaseCount: encounter?.targets?.length ?? 0 };
  }
  static manage() { const encounter = Store.get(); if (encounter) new EncounterEditor(encounter).render({ force: true }); else manager.render({ force: true }); }
  static selectActor(_event, target) { viewActorId = target.dataset.id; this.render({ force: true }); }
  static selectTarget(_event, target) {
    const encounter = Store.get();
    if (isChase(encounter) && target.dataset.id !== chaseObstacle(encounter)?.id) return;
    viewTargetId = target.dataset.id; this.render({ force: true });
  }
  static requestCheck(_event, target) {
    const encounter = Store.get();
    const actor = game.actors.get(viewActorId);
    const selectedTarget = encounter?.targets.find((entry) => entry.id === viewTargetId);
    const check = selectedTarget?.checks.find((entry) => entry.id === target.dataset.checkId);
    if (!encounter || !actor || !check || !canControlActor(actor) || encounter.actorsActed[actor.id] || (isResearch(encounter) && !researchSourceAvailable(selectedTarget, actor.id))) return ui.notifications.warn("Choose an eligible character and available source.");
    const request = { action: "request", encounterId: encounter.id, userId: game.user.id, actorId: actor.id, targetId: selectedTarget.id, checkId: check.id };
    if (game.user.isGM) handlePlayerRequest(request);
    else game.socket.emit(SOCKET, request);
    ui.notifications.info(`Requested ${check.label} for ${actor.name}.`);
  }
  static async adjustPoints(_event, target) {
    const targetId = target.dataset.id;
    const delta = Number(target.dataset.delta) || 0;
    let gained = [];
    let lost = [];
    await mutateActive(`${delta >= 0 ? "Added" : "Removed"} ${Math.abs(delta)} point`, async (encounter) => {
      const entry = encounter.targets.find((item) => item.id === targetId);
      if (!entry) return;
      const previous = entry.points;
      entry.points = Math.max(0, entry.points + delta);
      gained = crossedThresholds(entry, previous, entry.points);
      lost = lostThresholds(entry, previous, entry.points);
      for (const threshold of gained) for (const reward of threshold.rewards) {
        reward.active = reward.activation === "automatic";
        if (reward.kind === "points" && reward.activation === "automatic" && !reward.applied) {
          const pointTarget = encounter.targets.find((item) => item.id === reward.targetId) ?? entry;
          pointTarget.points = Math.max(0, pointTarget.points + reward.value);
          reward.applied = true;
        }
      }
      addLog(encounter, "points", `${entry.name}: ${delta >= 0 ? "+" : ""}${delta} point${Math.abs(delta) === 1 ? "" : "s"}.`, { targetId });
    });
    const updatedTarget = Store.get()?.targets.find((entry) => entry.id === targetId);
    if (updatedTarget) await postThresholdCards(updatedTarget, gained, lost);
  }
  static async adjustResearchPoints(_event, target) {
    const targetId = target.dataset.id;
    const actorId = target.dataset.actorId;
    const delta = Number(target.dataset.delta) || 0;
    await mutateActive("Adjusted individual research points", async (encounter) => {
      const source = encounter.targets.find((entry) => entry.id === targetId);
      if (!source || !isResearch(encounter)) return;
      const previous = source.points;
      const maximum = researchMaxFor(source, actorId);
      source.researchPointsByActor[actorId] = Math.max(0, Math.min(maximum || Infinity, researchPointsFor(source, actorId) + delta));
      source.points = encounter.research.pointMode === "individual" ? researchTotal(source) : Math.max(0, source.points + delta);
      if (delta < 0) source.exhausted = false;
      updateResearchExhaustion(encounter, source);
      addLog(encounter, "points", `${game.actors.get(actorId)?.name ?? "Character"}: ${delta >= 0 ? "+" : ""}${delta} RP from ${source.name}.`, { targetId, actorId });
      if (previous !== source.points) source.updatedAt = Date.now();
    });
  }
  static async toggleReward(_event, target) {
    let changed;
    await mutateActive("Changed reward activation", async (encounter) => {
      const reward = encounter.targets.flatMap((entry) => entry.thresholds.flatMap((threshold) => threshold.rewards)).find((entry) => entry.id === target.dataset.id);
      if (!reward) return;
      reward.active = !reward.active;
      changed = clone(reward);
      addLog(encounter, "reward", `${reward.active ? "Activated" : "Deactivated"} reward: ${reward.label}.`);
    });
    if (changed?.active && changed.playerVisible) await ChatMessage.create({ content: `<div class="dnd5e-nce-threshold gained"><h3>Reward Revealed: ${esc(changed.label)}</h3>${rewardDetail(changed) ? `<p>${esc(rewardDetail(changed))}</p>` : ""}</div>` });
    if (changed && !changed.active) await ChatMessage.create({ content: `<div class="dnd5e-nce-threshold lost"><h3>Reward Hidden: ${esc(changed.label)}</h3></div>` });
  }
  static async applyReward(_event, target) {
    await mutateActive("Applied point reward", async (encounter) => {
      const reward = encounter.targets.flatMap((entry) => entry.thresholds.flatMap((threshold) => threshold.rewards)).find((entry) => entry.id === target.dataset.id);
      if (!reward || reward.kind !== "points" || reward.applied) return;
      const pointTarget = encounter.targets.find((entry) => entry.id === reward.targetId);
      if (!pointTarget) return;
      pointTarget.points = Math.max(0, pointTarget.points + reward.value);
      reward.applied = true;
      addLog(encounter, "reward", `Applied ${reward.label}: ${signed(reward.value)} points to ${displayName(pointTarget)}.`);
    });
  }
  static async nextRound() {
    let chaseMoved = false;
    let chaseOutcome = "";
    await mutateActive("Advanced round", async (encounter) => {
      if (isChase(encounter)) {
        const before = encounter.chase.quarryPosition;
        advanceChaseRound(encounter);
        chaseMoved = encounter.chase.quarryPosition > before;
        chaseOutcome = encounter.chase.outcome;
        return;
      }
      advanceStandardRound(encounter);
    });
    if (chaseMoved) await postChaseUpdate("The quarry is getting farther ahead.", "lost");
    if (chaseOutcome) await postChaseOutcome(Store.get(), chaseOutcome);
  }
  static async completeRequest(_event, target) {
    const encounter = Store.get();
    const request = encounter?.pendingRequests.find((entry) => entry.id === target.dataset.id && entry.status === "pending");
    if (!request) return ui.notifications.warn("That request is no longer pending.");
    const requestTarget = encounter.targets.find((entry) => entry.id === request.targetId);
    const requestCheck = requestTarget?.checks.find((entry) => entry.id === request.checkId);
    const actor = game.actors.get(request.actorId);
    const modifiers = requestTarget && requestCheck ? applicableModifiers(encounter, requestTarget, requestCheck).map((modifier) => ({ ...modifier, checked: modifier.active && !modifier.conditional, signedValue: ["advantage", "disadvantage"].includes(modifier.effect) ? "" : signed(modifier.value) })) : [];
    const exhaustion = chaseExhaustionEffect(encounter, actor, requestCheck);
    const choice = await confirmRoll({ request, dc: requestCheck?.dc ?? 0, modifier: signed(actorCheckModifier(actor, requestCheck?.key)), criticalMode: encounter.criticalMode, modifiers, exhaustion });
    if (!choice) return;
    let result;
    try { result = await rollRequestedCheck(request, encounter, choice); }
    catch (error) { console.error(`${MODULE_ID} | Roll failed`, error); return ui.notifications.error(`The check could not be rolled: ${error.message}`); }
    if (!result) return ui.notifications.warn("The roll was cancelled or produced no result.");
    let chaseOutcome = "";
    let chaseDropout = "";
    let partyCaughtUp = false;
    let quarryMoved = false;
    await mutateActive("Resolved check request", async (current) => {
      const currentRequest = current.pendingRequests.find((entry) => entry.id === request.id);
      if (!currentRequest || currentRequest.status !== "pending") return;
      currentRequest.status = "completed";
      currentRequest.completedAt = Date.now();
      currentRequest.rollTotal = result.total;
      currentRequest.outcome = result.degree.key;
      currentRequest.situationalBonus = result.bonus;
      currentRequest.bonusNote = choice.bonusNote;
      current.actorsActed[currentRequest.actorId] = true;
      const currentTarget = current.targets.find((entry) => entry.id === currentRequest.targetId);
      const previousPoints = currentTarget.points;
      let earnedPoints = pointsForOutcome(result.check, result.degree.key);
      if (isResearch(current)) {
        const actorId = currentRequest.actorId;
        const maximum = researchMaxFor(currentTarget, actorId);
        const currentActorPoints = researchPointsFor(currentTarget, actorId);
        const nextActorPoints = Math.max(0, Math.min(maximum || Infinity, currentActorPoints + earnedPoints));
        earnedPoints = nextActorPoints - currentActorPoints;
        currentTarget.researchPointsByActor[actorId] = nextActorPoints;
        currentTarget.points = current.research.pointMode === "individual" ? researchTotal(currentTarget) : Math.max(0, previousPoints + earnedPoints);
        updateResearchExhaustion(current, currentTarget);
      } else if (isConsequenceChase(current)) {
        current.chase.successes = Math.max(0, current.chase.successes + earnedPoints);
      } else currentTarget.points = Math.max(0, currentTarget.points + earnedPoints);
      for (const selected of result.selectedModifiers) {
        const local = currentTarget.modifiers.find((modifier) => modifier.id === selected.id);
        const reward = current.targets.flatMap((entry) => entry.thresholds.flatMap((threshold) => threshold.rewards)).find((entry) => entry.id === selected.id);
        const stored = local ?? reward;
        if (stored?.uses) stored.remaining = Math.max(0, stored.remaining - 1);
      }
      const gained = crossedThresholds(currentTarget, previousPoints, currentTarget.points);
      const lost = lostThresholds(currentTarget, previousPoints, currentTarget.points);
      for (const threshold of gained) for (const reward of threshold.rewards) {
        reward.active = reward.activation === "automatic";
        if (reward.kind === "points" && reward.activation === "automatic" && !reward.applied) {
          const pointTarget = current.targets.find((entry) => entry.id === reward.targetId) ?? currentTarget;
          pointTarget.points = Math.max(0, pointTarget.points + reward.value);
          reward.applied = true;
        }
      }
      currentRequest.pointsAwarded = earnedPoints;
      currentRequest.gainedThresholdIds = gained.map((entry) => entry.id);
      currentRequest.lostThresholdIds = lost.map((entry) => entry.id);
      addLog(current, "action", `${currentRequest.actorName} rolled ${result.total} on ${currentRequest.checkLabel}: ${result.degree.label}; ${earnedPoints >= 0 ? "+" : ""}${earnedPoints} ${isConsequenceChase(current) ? "Chase Success" : "point"}${Math.abs(earnedPoints) === 1 ? "" : "s"}.`, currentRequest);
      if (isChase(current)) {
        const exhaustion = result.degree.key === "criticalFailure" ? currentTarget.criticalFailureExhaustion : result.degree.key === "failure" ? currentTarget.failureExhaustion : 0;
        if (exhaustion) {
          const prior = chaseExhaustion(current, currentRequest.actorId);
          const level = Math.min(5, prior + exhaustion);
          current.chase.exhaustionByActor[currentRequest.actorId] = level;
          addLog(current, "chase", `${currentRequest.actorName} gains ${exhaustion} Chase Exhaustion (now ${level}).`, { actorId: currentRequest.actorId, exhaustion: level });
          if (level >= 5 && prior < 5) chaseDropout = currentRequest.actorName;
        }
        if (!isConsequenceChase(current) && chaseGoal(current, currentTarget) && currentTarget.points >= chaseGoal(current, currentTarget)) {
          const gapBefore = current.chase.quarryPosition - current.chase.partyPosition;
          current.chase.partyPosition = Math.min(current.targets.length, current.chase.partyPosition + 1);
          current.activeTargetId = chaseObstacle(current)?.id ?? "";
          addLog(current, "chase", `The party overcame ${currentTarget.name}.`, { targetId: currentTarget.id, partyPosition: current.chase.partyPosition });
          if (!current.chase.scriptedQuarry && current.chase.partyPosition >= current.chase.quarryPosition) {
            concludeChase(current, "victory"); chaseOutcome = "victory";
          }
          partyCaughtUp = current.chase.quarryPosition - current.chase.partyPosition < gapBefore;
        }
        if (!current.chase.concluded && current.autoAdvance && allEligibleParticipantsActed(current)) {
          const quarryBefore = current.chase.quarryPosition;
          advanceChaseRound(current);
          quarryMoved = current.chase.quarryPosition > quarryBefore;
          if (current.chase.concluded) chaseOutcome = current.chase.outcome;
        }
      } else if (current.autoAdvance && allEligibleParticipantsActed(current)) advanceStandardRound(current);
    });
    await postResultCard(encounter, result, choice);
    const updated = Store.get();
    const updatedTarget = updated.targets.find((entry) => entry.id === request.targetId);
    const completed = updated.pendingRequests.find((entry) => entry.id === request.id);
    await postThresholdCards(updatedTarget, updatedTarget.thresholds.filter((entry) => completed.gainedThresholdIds?.includes(entry.id)), updatedTarget.thresholds.filter((entry) => completed.lostThresholdIds?.includes(entry.id)));
    if (chaseDropout) await ChatMessage.create({ content: `<div class="dnd5e-nce-threshold lost"><h3>${esc(chaseDropout)} drops out of the chase</h3><p>They reached 5 levels of Chase Exhaustion. All Chase Exhaustion clears after a short rest.</p></div>` });
    if (partyCaughtUp && !chaseOutcome) await postChaseUpdate("The party is catching up with the quarry.");
    if (quarryMoved && !chaseOutcome) await postChaseUpdate("The quarry is getting farther ahead.", "lost");
    if (chaseOutcome) await postChaseOutcome(Store.get(), chaseOutcome);
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
  static async concludeChase(_event, target) {
    const outcome = target.dataset.outcome;
    let concluded = false;
    await mutateActive("Concluded chase", async (encounter) => {
      if (!isChase(encounter) || encounter.chase.concluded) return;
      concludeChase(encounter, outcome); concluded = true;
    });
    if (concluded) await postChaseOutcome(Store.get(), outcome);
  }
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
  const active = encounter.id === activeId && encounter.status === "active";
  return `<li class="directory-item document dnd5e-nce-sidebar-entry ${active ? "active" : ""}" data-id="${esc(encounter.id)}" tabindex="0">
    <img class="thumbnail" src="${esc(encounter.image)}" alt="">
    <a class="document-name ellipsis">${esc(encounter.name)}</a>
    ${active ? '<i class="fa-solid fa-play dnd5e-nce-active-marker" data-tooltip="Active Encounter"></i>' : ""}
  </li>`;
}

async function handleEncounterSidebarAction(event) {
  const button = event.target.closest("[data-nce-action]");
  if (!button) return;
  const action = button.dataset.nceAction;
  const id = button.closest("[data-id]")?.dataset.id;
  if (action === "create") await createEncounter(event);
  else if (action === "edit") new EncounterEditor(Store.get(id)).render({ force: true });
  else if (action === "activate") await activateEncounter(id);
  else if (action === "pause") await pauseEncounter(id);
  else if (action === "resume") await resumeEncounter(id);
  else if (action === "open" && Store.get()?.status === "active") tracker.render(true);
  else if (action === "remove") await deleteEncounter(id);
}

function closeEncounterContextMenu() {
  document.getElementById("dnd5e-nce-context-menu")?.remove();
}

function openSidebarEncounter(id) {
  const encounter = Store.get(id);
  if (!encounter) return;
  return id === Store.activeId() && encounter.status === "active"
    ? tracker.render(true)
    : new EncounterEditor(encounter).render({ force: true });
}

function showEncounterContextMenu(event, id) {
  const encounter = Store.get(id);
  if (!game.user.isGM || !encounter) return;
  closeEncounterContextMenu();
  const menu = document.createElement("nav");
  menu.id = "dnd5e-nce-context-menu";
  menu.className = "dnd5e-nce-context-menu";
  const lifecycle = encounter.status === "active"
    ? '<button type="button" data-context-action="pause"><i class="fa-solid fa-pause"></i> Pause</button>'
    : encounter.status === "paused"
      ? '<button type="button" data-context-action="resume"><i class="fa-solid fa-play"></i> Resume</button>'
      : '<button type="button" data-context-action="activate"><i class="fa-solid fa-play"></i> Activate</button>';
  menu.innerHTML = `<button type="button" data-context-action="edit"><i class="fa-solid fa-pen"></i> Edit</button>${lifecycle}<button type="button" data-context-action="duplicate"><i class="fa-solid fa-copy"></i> Duplicate as Draft</button><hr><button type="button" data-context-action="import"><i class="fa-solid fa-file-import"></i> Import Data</button><button type="button" data-context-action="export"><i class="fa-solid fa-file-export"></i> Export Data</button><hr><button type="button" data-context-action="delete"><i class="fa-solid fa-trash"></i> Delete</button>`;
  document.body.append(menu);
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - bounds.width - 8)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - bounds.height - 8)}px`;
  menu.querySelectorAll("[data-context-action]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.contextAction;
    closeEncounterContextMenu();
    if (action === "edit") new EncounterEditor(Store.get(id)).render({ force: true });
    else if (action === "activate") await activateEncounter(id);
    else if (action === "pause") await pauseEncounter(id);
    else if (action === "resume") await resumeEncounter(id);
    else if (action === "duplicate") await duplicateEncounterAsDraft(id);
    else if (action === "import") importEncounterData();
    else if (action === "export") exportEncounterData(id);
    else if (action === "delete") await deleteEncounter(id);
  }));
  setTimeout(() => {
    document.addEventListener("pointerdown", (pointerEvent) => {
      if (!menu.contains(pointerEvent.target)) closeEncounterContextMenu();
    }, { once: true });
    document.addEventListener("keydown", closeEncounterContextMenu, { once: true });
  }, 0);
}

function activateEncounterDirectoryListeners(panel) {
  panel.querySelectorAll(".dnd5e-nce-sidebar-entry").forEach((entry) => {
    const open = () => openSidebarEncounter(entry.dataset.id);
    entry.addEventListener("click", open);
    entry.addEventListener("keydown", (event) => { if (event.key === "Enter") open(); });
    entry.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showEncounterContextMenu(event, entry.dataset.id);
    });
  });
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
      const encounterTab = tabsMenu.querySelector(`[data-tab="${SIDEBAR_TAB}"]`);
      encounterTab?.classList.remove("active");
      encounterTab?.setAttribute("aria-pressed", "false");
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
    panel.classList.add("directory");
    panel.innerHTML = `<header class="directory-header"><div class="header-actions action-buttons flexrow"><button type="button" data-nce-action="create"><i class="fa-solid fa-file-circle-plus"></i> Create Encounter</button></div></header><ol class="directory-list plain dnd5e-nce-sidebar-list">${encounters.map((entry) => sidebarEncounterEntry(entry, Store.activeId())).join("") || '<li class="directory-item"><p class="hint">No encounters created yet.</p></li>'}</ol>`;
    activateEncounterDirectoryListeners(panel);
  } else {
    panel.classList.remove("directory");
    const encounter = Store.get();
    panel.innerHTML = encounter
      ? `<header class="dnd5e-nce-sidebar-header"><h2>${esc(encounter.name)}</h2></header><div class="dnd5e-nce-sidebar-player"><img src="${esc(encounter.image)}" alt=""><p>${esc(TYPE_LABELS[encounter.type])} — ${esc(encounter.status)}</p>${encounter.status === "active" ? '<button type="button" data-nce-action="open"><i class="fa-solid fa-up-right-from-square"></i> Open Encounter</button>' : '<p class="hint">This encounter is paused.</p>'}</div>`
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
  game[MODULE_ID] = { open: () => { if (Store.get()?.status === "active") tracker.render(true); }, manage: () => manager.render({ force: true }), Store };
  game.socket.on(SOCKET, handleSocketMessage);
  await migrateEncounters();
  renderEncounterSidebar();
  if (game.user.isGM) {
    const active = Store.get();
    if (active?.status === "active") {
      renderCinematicHud();
      tracker.render(true);
    }
  } else game.socket.emit(SOCKET, { action: "request-sync", userId: game.user.id });
});

Hooks.on("nonCombatEncounterUpdated", () => {
  renderCinematicHud();
  if (Store.get()?.status === "active") tracker?.render(false);
  else tracker?.close();
  manager?.render(false);
  renderEncounterSidebar();
});
Hooks.on("renderSidebar", renderEncounterSidebar);
Hooks.on("renderSceneControls", (_app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0]; const tools = root?.querySelector("#scene-controls-tools");
  if (!tools || tools.querySelector(".dnd5e-nce-control")) return;
  const item = document.createElement("li");
  item.innerHTML = '<button type="button" class="control ui-control tool icon fa-solid fa-people-group dnd5e-nce-control" aria-label="Non-Combat Encounters" data-tooltip="Non-Combat Encounters"></button>';
  item.querySelector("button").addEventListener("click", () => { if (Store.get()?.status === "active") tracker.render(true); }); tools.append(item);
});
