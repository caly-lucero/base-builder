// Campaña: qué se ataca y cómo se aplica el resultado de una batalla a la partida. Lógica pura.
import { ARMY_UNITS, COMBAT, HERO_MAX_LEVEL, RESOURCES, heroXpToNext } from '../data/config.js';
import { armyCount, resourceCap } from './logic.js';

/** Nivel de campaña que se ataca ahora: el siguiente al último superado. */
export const nextCampaignLevel = (state) => state.campaign.cleared + 1;

/** ¿Hay con qué atacar? (alguna unidad de ejército o el héroe). */
export const canAttack = (state) => armyCount(state) > 0 || Boolean(state.hero);

/**
 * Da experiencia al héroe (si existe) y lo sube de nivel mientras le alcance.
 * Devuelve { xp (lo dado), heroLevelUps, hero: { level, xp, next } | null }.
 */
export function grantHeroXp(state, amount) {
  if (!state.hero) return { xp: 0, heroLevelUps: 0, hero: null };
  let heroLevelUps = 0;
  state.hero.xp += amount;
  while (state.hero.level < HERO_MAX_LEVEL && state.hero.xp >= heroXpToNext(state.hero.level)) {
    state.hero.xp -= heroXpToNext(state.hero.level);
    state.hero.level += 1;
    heroLevelUps += 1;
  }
  if (state.hero.level >= HERO_MAX_LEVEL) state.hero.xp = 0;
  const next = state.hero.level >= HERO_MAX_LEVEL ? null : heroXpToNext(state.hero.level);
  return { xp: amount, heroLevelUps, hero: { level: state.hero.level, xp: state.hero.xp, next } };
}

/**
 * Aplica el resultado de una batalla a la partida:
 *  - se pierden las unidades que cayeron (el héroe nunca se pierde);
 *  - el botín entra sin pasar el tope de recursos;
 *  - si se ganó el nivel que tocaba, avanza la campaña;
 *  - el héroe gana experiencia por lo que destruye y derrota (aunque pierdas) y un bono si ganas;
 *    puede subir de nivel.
 * Devuelve un informe para mostrar: { won, level, loot (lo que realmente entró), casualties, xp, heroLevelUps,
 * hero ({ level, xp, next } o null), cleared }.
 */
export function applyBattleResult(state, result) {
  for (const u of ARMY_UNITS) state.army[u] = Math.max(0, state.army[u] - (result.casualties[u] ?? 0));

  const cap = resourceCap(state);
  const loot = {};
  for (const r of RESOURCES) {
    const before = state[r];
    state[r] = Math.max(before, Math.min(cap, before + (result.loot[r] ?? 0)));
    loot[r] = state[r] - before;
  }

  let cleared = false;
  if (result.won && result.level === nextCampaignLevel(state)) {
    state.campaign.cleared += 1;
    cleared = true;
  }

  const earned =
    (result.destroyed ?? 0) * COMBAT.heroXpPerBuilding +
    (result.kills ?? 0) * COMBAT.heroXpPerKill +
    (result.won ? COMBAT.heroXpWin + COMBAT.heroXpPerLevel * result.level : 0);
  const { xp, heroLevelUps, hero } = grantHeroXp(state, earned);

  return { won: result.won, level: result.level, percent: result.percent, loot, casualties: { ...result.casualties }, xp, heroLevelUps, hero, cleared };
}
