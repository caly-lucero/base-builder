// Ataques enemigos a TU base: oleadas periódicas con aviso. Lógica pura.
//
// Cada cierto tiempo (RAID.intervalSec) llega una oleada. Se resuelve sola con la misma simulación
// de batalla, con tu base como defensora: torres, muros, ejército y héroe. Si el enemigo destruye
// edificios, quedan DAÑADOS (no producen, entrenan ni mejoran hasta que los repares) y te roba una
// parte de los recursos. Tus tropas no mueren al defender y el Ayuntamiento nunca se daña.
import { RAID, RESOURCES } from '../data/config.js';
import { advanceBattle, createRaidBattle } from './battle.js';
import { grantHeroXp } from './campaign.js';
import { mulberry32 } from './decor.js';
import { townHallLevel } from './logic.js';

const MAX_RAID_LEVEL = 30;

/** Fuerza de la próxima oleada: crece con el Ayuntamiento y con la campaña superada. */
export function raidLevel(state) {
  return Math.min(MAX_RAID_LEVEL, 1 + (townHallLevel(state) - 1) * 2 + Math.floor(state.campaign.cleared / 2));
}

/**
 * Genera una oleada de nivel `level`. `seed` la varía (la misma semilla da siempre lo mismo).
 * Devuelve { level, hpScale, dmgScale, attackers: [{ kind, x, y }] }; llegan por el borde de arriba del mapa.
 */
export function generateRaid(level, seed = 1) {
  const lvl = Math.max(1, Math.floor(level));
  const rand = mulberry32(5000 + lvl * 131 + seed * 7919);
  const guards = 2 + Math.round(lvl * 1.5);
  const brutes = Math.floor((lvl - 1) / 2);
  const attackers = [];
  const at = (kind) => attackers.push({ kind, x: 7 + rand() * 10, y: 0.5 + rand() * 1.5 });
  for (let i = 0; i < guards; i++) at('guard');
  for (let i = 0; i < brutes; i++) at('brute');
  return { level: lvl, hpScale: 1 + 0.1 * (lvl - 1), dmgScale: 1 + 0.07 * (lvl - 1), attackers };
}

/* ---------- calendario ---------- */

export const raidDue = (state, now) => state.raid.nextAt > 0 && now >= state.raid.nextAt;
export const raidCountdownMs = (state, now) => Math.max(0, state.raid.nextAt - now);

/* ---------- simulación y resultado ---------- */

/** Corre la defensa completa (sin dibujar nada) y devuelve su resultado. No modifica la partida. */
export function simulateRaid(state, raid) {
  const b = createRaidBattle(state, raid);
  for (let i = 0; i < 5000 && !b.over; i++) advanceBattle(b, 0.1);
  return b.result;
}

/**
 * Aplica el resultado de una defensa: daña los edificios destruidos (menos el Ayuntamiento), roba
 * recursos y da experiencia al héroe. Devuelve el informe que se le muestra al jugador.
 */
export function applyRaidResult(state, result) {
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const damaged = [];
  for (const id of result.destroyedIds) {
    const b = byId.get(id);
    if (b && b.type !== 'townhall' && !b.damaged) {
      b.damaged = true;
      damaged.push(b.type);
    }
  }

  const fraction = Math.min(RAID.stealMax, result.destroyed * RAID.stealPerBuilding + (result.hallDown ? RAID.stealHall : 0));
  const stolen = {};
  for (const r of RESOURCES) {
    stolen[r] = Math.floor(state[r] * fraction);
    state[r] -= stolen[r];
  }

  const earned = result.kills * RAID.heroXpPerKill + (result.outcome === 'repelled' ? RAID.heroXpRepel : 0);
  const { xp, heroLevelUps, hero, heroes } = grantHeroXp(state, earned);

  return {
    outcome: result.outcome, // 'repelled' | 'retreated' | 'raided'
    level: result.level,
    kills: result.kills,
    destroyed: result.destroyed,
    damaged: damaged.length, // edificios que quedaron dañados (incluye muros y puertas)
    damagedTypes: damaged,
    hallDown: result.hallDown,
    stolen,
    xp,
    heroLevelUps,
    hero,
    heroes,
  };
}

/**
 * Resuelve la oleada que toca ahora: simula, aplica el resultado y programa la siguiente.
 * Devuelve el informe.
 */
export function resolveRaid(state, now) {
  const raid = generateRaid(raidLevel(state), state.raid.count + 1);
  // Una copia sin avanzar de la defensa, para poder VERLA después (es determinista: sale igual que el resultado).
  const replay = createRaidBattle(state, raid);
  const report = applyRaidResult(state, simulateRaid(state, raid));
  Object.defineProperty(report, 'replay', { value: replay, enumerable: false });
  state.raid.count += 1;
  state.raid.nextAt = now + RAID.intervalSec * 1000;
  return report;
}
