// Informe de equilibrio: simula (sin dibujar) ejércitos típicos de cada nivel de Ayuntamiento contra los
// enemigos de la campaña y de los ataques a tu base. Sirve para calibrar números sin jugar a mano.
//
//   node tools/balance.mjs            tabla de estrellas (0-3) y de resultados de defensa
//   node tools/balance.mjs --fill 0.6 con el 60 % del ejército máximo (un jugador que no lo gasta todo)
//
// Es una aproximación: el ejército ataca sin órdenes (ir al Ayuntamiento y pelear), sin usar habilidades.
import { ARMY_UNITS, UNITS } from '../src/data/config.js';
import { advanceBattle, createBattle } from '../src/game/battle.js';
import { createBuilding, createNewState, squadHeroes, statsOf, supplyCap, unitCombat } from '../src/game/logic.js';
import { generateMission } from '../src/game/missions.js';
import { generateRaid, simulateRaid } from '../src/game/raids.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const FILL = arg('fill', 1);

/** Una partida típica con el Ayuntamiento en `level`: casas, edificios militares y mejoras acordes. */
export function profile(level, fill = 1) {
  const s = createNewState(0);
  s.buildings[0].level = level;
  let id = 2;
  // Edificios repartidos en filas por el mapa, sin pisar el Ayuntamiento (que ocupa el centro).
  const slots = [];
  for (const y of [1, 5, 9, 13, 33, 37, 41, 45]) for (let x = 1; x + 2 <= 46; x += 5) slots.push({ x, y });
  const add = (type, lvl) => {
    const at = slots.shift();
    s.buildings.push(createBuilding(id++, type, at.x, at.y, 0, lvl));
  };
  const limits = statsOf('townhall', level).limits;
  for (let i = 0; i < limits.house; i++) add('house', Math.max(1, level - 1));
  for (let i = 0; i < Math.floor(limits.tower / 2); i++) add('tower', Math.max(1, level - 1));
  for (const t of ['barracks', 'archery', 'atelier', 'stable', 'siege', 'forge', 'altar']) if (limits[t] > 0) add(t, Math.max(1, level - 1));
  for (const track of Object.keys(s.research)) s.research[track] = Math.max(0, Math.min(level - 1, 10)) * (track === 'fortify' ? 1 : 1);
  // Héroes: el paladín desde que hay Altar (nivel 2) y la cazadora desde el Ayuntamiento 5, al nivel que permite el Ayuntamiento.
  const heroLevel = Math.min(20, level * 2);
  if (limits.altar > 0) {
    s.heroes.paladin = { level: heroLevel, xp: 0 };
    s.squad.push('paladin');
    if (level >= 5) {
      s.heroes.ranger = { level: heroLevel, xp: 0 };
      s.squad.push('ranger');
    }
  }
  // Reparte la población entre las unidades que ya se pueden entrenar.
  const open = ARMY_UNITS.filter((k) => s.buildings.some((b) => b.type === UNITS[k].building && b.level >= UNITS[k].minLevel));
  const weight = { soldier: 4, archer: 3, mage: 2, knight: 1.5, catapult: 0.7, ram: 0.7 };
  let room = Math.floor((supplyCap(s) - 1) * fill); // un lugar queda para el héroe
  const total = open.reduce((n, k) => n + weight[k], 0);
  for (const k of open) s.army[k] = Math.floor(((room * weight[k]) / total) / UNITS[k].supply);
  return s;
}

/** Ataca el nivel de campaña `lvl` con la partida `s`. Devuelve el resultado de la batalla. */
export function attack(s, lvl) {
  const heroes = squadHeroes(s);
  const stats = Object.fromEntries(ARMY_UNITS.map((k) => [k, unitCombat(s, k)]));
  const b = createBattle(generateMission(lvl), s.army, heroes, stats);
  for (let i = 0; i < 4000 && !b.over; i++) advanceBattle(b, 0.1);
  if (!b.over) advanceBattle(b, 999);
  return b.result;
}

if (process.argv[1]?.endsWith('balance.mjs')) {
  const levels = [1, 3, 5, 8, 10, 12, 15, 18, 20, 25, 30];
  console.log(`\nEstrellas por nivel de campaña (ejército al ${Math.round(FILL * 100)} %)`);
  console.log(`Ayunt. | tropas | ${levels.map((l) => String(l).padStart(2)).join(' ')}`);
  for (let h = 1; h <= 10; h++) {
    const s = profile(h, FILL);
    const troops = ARMY_UNITS.reduce((n, k) => n + s.army[k], 0);
    const row = levels.map((l) => String(attack(s, l).stars).padStart(2));
    console.log(`${String(h).padStart(6)} | ${String(troops).padStart(6)} | ${row.join(' ')}`);
  }

  console.log('\nDefensa contra ataques a tu base: resultado por Ayuntamiento (sin torres ni muros): R = rechazado, T = se retiró, X = tumbaron el Ayuntamiento');
  for (let h = 1; h <= 10; h++) {
    const s = profile(h, FILL);
    const lvl = Math.min(30, 1 + (h - 1) * 2);
    const r = simulateRaid(s, generateRaid(lvl, 1));
    console.log(`Ayunt. ${String(h).padStart(2)} · fuerza ${String(lvl).padStart(2)}: ${{ repelled: 'R', retreated: 'T', raided: 'X' }[r.outcome]} · derrotados ${r.kills} · edificios destruidos ${r.destroyed}`);
  }
}
