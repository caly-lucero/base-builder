// Misiones: lógica pura. El progreso se calcula mirando la partida (no se guarda); solo se
// guarda cuáles ya se reclamaron (state.claimedQuests).
import { QUESTS, RESOURCES } from '../data/config.js';
import { armyCount, countOf, isUpgrading, resourceCap, townHallLevel } from './logic.js';

export const questIds = () => QUESTS.map((q) => q.id);

export function questById(id) {
  return QUESTS.find((q) => q.id === id) ?? null;
}

/** Avance de una misión: { current, target, done }. `current` nunca pasa de `target`. */
export function questProgress(state, quest) {
  const g = quest.goal;
  let current = 0;
  let target = 1;
  if (g.kind === 'count') {
    current = countOf(state, g.building);
    target = g.min;
  } else if (g.kind === 'townhall') {
    current = townHallLevel(state);
    target = g.level;
  } else if (g.kind === 'army') {
    current = armyCount(state);
    target = g.min;
  } else if (g.kind === 'unit') {
    current = state.army[g.unit] ?? 0;
    target = g.min;
  } else if (g.kind === 'campaign') {
    current = state.campaign.cleared;
    target = g.min;
  } else if (g.kind === 'hero') {
    current = state.hero ? 1 : 0;
  } else if (g.kind === 'anyLevel') {
    current = state.buildings.reduce((max, b) => (b.type === 'townhall' || isUpgrading(b) ? max : Math.max(max, b.level)), 0);
    target = g.level;
  }
  return { current: Math.min(current, target), target, done: current >= target };
}

/** La misión en curso: la primera que no se ha reclamado, o null si ya se hicieron todas. */
export function currentQuest(state) {
  return QUESTS.find((q) => !state.claimedQuests.includes(q.id)) ?? null;
}

/** Cuántas misiones se han reclamado y cuántas hay. */
export const questCounts = (state) => ({ claimed: state.claimedQuests.length, total: QUESTS.length });

/**
 * Reclama la recompensa de la misión en curso si ya está cumplida. Las recompensas no pasan
 * del tope de recursos. Devuelve { ok, quest, granted: { gold, wood } }.
 */
export function claimQuest(state, id) {
  const quest = currentQuest(state);
  if (!quest || quest.id !== id) return { ok: false, reason: 'Esa misión no está disponible' };
  if (!questProgress(state, quest).done) return { ok: false, reason: 'Aún no cumpliste la misión' };

  const cap = resourceCap(state);
  const granted = {};
  for (const r of RESOURCES) {
    const give = quest.reward[r] ?? 0;
    const before = state[r];
    state[r] = Math.min(cap, before + give);
    granted[r] = Math.max(0, state[r] - before);
  }
  state.claimedQuests.push(quest.id);
  return { ok: true, quest, granted };
}
