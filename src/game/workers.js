// Aldeanos: adorno animado, no afecta a la economía. Cada edificio productor (mina,
// aserradero) tiene un aldeano que camina entre el Ayuntamiento y el edificio llevando
// lo que produce. Esta parte es lógica pura (rutas y tiempos); el dibujo está en la escena.
import { isUpgrading, statsOf, townHall } from './logic.js';

export const WORKER_SPEED = 1.5; // casillas por segundo
export const WORK_TIME = 0.8; // segundos que trabaja en el edificio
export const REST_TIME = 0.5; // segundos que descansa en el Ayuntamiento

/**
 * Qué aldeanos debería haber ahora: uno por edificio productor que no esté en obras.
 * Devuelve [{ buildingId, resource, home: {x,y}, site: {x,y} }] en coordenadas de casilla.
 */
export function plannedWorkers(state) {
  const hall = townHall(state);
  if (!hall) return [];
  const out = [];
  for (const b of state.buildings) {
    const resource = statsOf(b.type, b.level).produces;
    if (!resource || isUpgrading(b)) continue;
    out.push({ buildingId: b.id, resource, home: { x: hall.x, y: hall.y }, site: { x: b.x, y: b.y } });
  }
  return out;
}

export const MAX_VISIBLE_WORKERS = 3;

/**
 * Solo unos pocos aldeanos se dibujan, como adorno (uno por edificio llenaba el mapa de gente yendo y viniendo).
 * Se eligen los productores más antiguos, alternando oro y madera, así no cambian al construir más.
 */
export function symbolicWorkers(planned, max = MAX_VISIBLE_WORKERS) {
  const byId = (a, b) => a.buildingId - b.buildingId;
  const queues = { gold: planned.filter((p) => p.resource === 'gold').sort(byId), wood: planned.filter((p) => p.resource === 'wood').sort(byId) };
  const out = [];
  for (let round = 0; out.length < max && (queues.gold.length || queues.wood.length); round++) {
    for (const r of ['gold', 'wood']) {
      const next = queues[r].shift();
      if (next && out.length < max) out.push(next);
    }
  }
  return out;
}

/** Un aldeano nuevo. Cada uno arranca desfasado según su edificio para que no marchen todos a la vez. */
export function createWorker(buildingId) {
  return { phase: 'out', t: (buildingId * 0.37) % 1, wait: 0 };
}

const isLeg = (w) => w.phase === 'out' || w.phase === 'back';

/** Avanza `dt` segundos. Consume el tiempo fase por fase, así un `dt` grande da lo mismo que muchos chicos. */
export function stepWorker(w, dt, home, site) {
  const dist = Math.max(Math.hypot(site.x - home.x, site.y - home.y), 0.5);
  // Un ciclo completo devuelve al aldeano al mismo estado, así que un `dt` enorme (volver a
  // la pestaña tras un rato) equivale a su resto dentro del ciclo.
  const cycle = (2 * dist) / WORKER_SPEED + WORK_TIME + REST_TIME;
  let left = dt % cycle;
  for (let guard = 0; left > 0 && guard < 16; guard++) {
    if (isLeg(w)) {
      const need = ((1 - w.t) * dist) / WORKER_SPEED; // segundos que faltan para terminar el tramo
      if (left < need) {
        w.t += (left * WORKER_SPEED) / dist;
        left = 0;
      } else {
        left -= need;
        w.t = 0;
        w.phase = w.phase === 'out' ? 'work' : 'rest';
        w.wait = w.phase === 'work' ? WORK_TIME : REST_TIME;
      }
    } else if (left < w.wait) {
      w.wait -= left;
      left = 0;
    } else {
      left -= w.wait;
      w.wait = 0;
      w.phase = w.phase === 'work' ? 'back' : 'out';
      w.t = 0;
    }
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Dónde está: { x, y } en casillas, `carrying` (va de vuelta con la carga) y `moving` (camina). */
export function workerPosition(w, home, site) {
  let x;
  let y;
  if (w.phase === 'out') [x, y] = [lerp(home.x, site.x, w.t), lerp(home.y, site.y, w.t)];
  else if (w.phase === 'back') [x, y] = [lerp(site.x, home.x, w.t), lerp(site.y, home.y, w.t)];
  else [x, y] = w.phase === 'work' ? [site.x, site.y] : [home.x, home.y];
  return { x, y, carrying: w.phase === 'back', moving: isLeg(w) };
}
