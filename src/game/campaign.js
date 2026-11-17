// Campaña: qué se ataca y cómo se aplica el resultado de una batalla a la partida. Lógica pura.
import { ARMY_UNITS, COMBAT, RESOURCES } from '../data/config.js';
import { HEROES, heroXpToNext } from '../data/heroes.js';
import { armyCount, heroLevelCap, resourceCap, squadHeroes } from './logic.js';

/** Nivel de campaña que se ataca ahora: el siguiente al último superado. */
export const nextCampaignLevel = (state) => state.campaign.cleared + 1;

/** ¿Hay con qué atacar? (alguna unidad de ejército o algún héroe en la escuadra). */
export const canAttack = (state) => armyCount(state) > 0 || squadHeroes(state).length > 0;

/**
 * Da experiencia a cada héroe de la escuadra y lo sube de nivel mientras le alcance. Su nivel no pasa
 * del tope que da el Ayuntamiento (el doble de su nivel, máx. 20): al llegar, la experiencia se guarda
 * (hasta lo que pide el siguiente nivel) y sigue cuando subes el Ayuntamiento.
 * Devuelve { xp (lo dado a cada uno), heroLevelUps (en total), hero (el primero: { key, level, xp, next, capped } o null),
 * heroes (todos los de la escuadra, igual) }.
 */
export function grantHeroXp(state, amount) {
  const cap = heroLevelCap(state);
  const heroes = [];
  let heroLevelUps = 0;
  for (const key of state.squad) {
    const h = state.heroes[key];
    if (!h) continue;
    h.xp += amount;
    while (h.level < cap && h.xp >= heroXpToNext(h.level)) {
      h.xp -= heroXpToNext(h.level);
      h.level += 1;
      heroLevelUps += 1;
    }
    if (h.level >= cap) h.xp = Math.min(h.xp, heroXpToNext(h.level)); // en el tope: guarda a lo sumo lo que pide el siguiente nivel
    heroes.push({ key, name: HEROES[key].name, level: h.level, xp: h.xp, next: heroXpToNext(h.level), capped: h.level >= cap });
  }
  return { xp: heroes.length ? amount : 0, heroLevelUps, hero: heroes[0] ?? null, heroes };
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
  const { xp, heroLevelUps, hero, heroes } = grantHeroXp(state, earned);

  return { won: result.won, level: result.level, percent: result.percent, loot, casualties: { ...result.casualties }, xp, heroLevelUps, hero, heroes, cleared };
}
