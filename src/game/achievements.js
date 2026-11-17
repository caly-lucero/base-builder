// Logros: lógica pura. El progreso se calcula mirando la partida (no se cuenta aparte); lo único que
// se guarda es cuántos niveles de cada logro ya se reclamaron (state.achievements).
import { ACHIEVEMENTS, RESOURCES } from '../data/config.js';
import { armyCount, heroCount, resourceCap, townHallLevel } from './logic.js';

const SMALL = new Set(['wall', 'gate']);

/** Lo que mide cada tipo de logro, hoy. */
export function measure(state, kind) {
  switch (kind) {
    case 'buildings':
      return state.buildings.filter((b) => !SMALL.has(b.type) && b.type !== 'townhall').length;
    case 'walls':
      return state.buildings.filter((b) => SMALL.has(b.type)).length;
    case 'townhall':
      return townHallLevel(state);
    case 'buildingLevel':
      return state.buildings.filter((b) => b.type !== 'townhall').reduce((max, b) => Math.max(max, b.level), 0);
    case 'army':
      return armyCount(state);
    case 'siege':
      return (state.army.catapult ?? 0) + (state.army.ram ?? 0);
    case 'campaign':
      return state.campaign.cleared;
    case 'heroes':
      return heroCount(state);
    case 'heroLevel':
      return Object.values(state.heroes).reduce((max, h) => Math.max(max, h.level), 0);
    case 'research':
      return Math.max(0, ...Object.values(state.research));
    case 'raids':
      return state.raid.count;
    default:
      return 0;
  }
}

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) ?? null;

/**
 * Estado de un logro: { claimed (niveles ya reclamados), total, current (lo medido), next (el siguiente nivel
 * o null si ya están todos), claimable (el siguiente ya se cumplió) }.
 */
export function achievementStatus(state, def) {
  const claimed = state.achievements?.[def.id] ?? 0;
  const current = measure(state, def.kind);
  const next = def.tiers[claimed] ?? null;
  return { claimed, total: def.tiers.length, current, next, claimable: Boolean(next) && current >= next.target };
}

/** Cuántos logros tienen un premio listo para reclamar (para el aviso del botón). */
export const claimableCount = (state) => ACHIEVEMENTS.filter((a) => achievementStatus(state, a).claimable).length;

/**
 * Reclama el siguiente nivel de un logro si ya se cumplió. Los premios no pasan del tope de recursos.
 * Devuelve { ok, granted: { gold, wood }, tier } o { ok:false, reason }.
 */
export function claimAchievement(state, id) {
  const def = achievementById(id);
  if (!def) return { ok: false, reason: 'Ese logro no existe' };
  const st = achievementStatus(state, def);
  if (!st.next) return { ok: false, reason: 'Ya reclamaste todo este logro' };
  if (!st.claimable) return { ok: false, reason: 'Aún no lo cumples' };

  const cap = resourceCap(state);
  const granted = {};
  for (const r of RESOURCES) {
    const before = state[r];
    state[r] = Math.min(cap, before + (st.next.reward[r] ?? 0));
    granted[r] = Math.max(0, state[r] - before);
  }
  state.achievements[def.id] = st.claimed + 1;
  return { ok: true, granted, tier: st.claimed + 1, name: def.name };
}
