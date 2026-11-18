// Premio diario por conectarse. Lógica pura.
//
// Hay 7 premios que suben cada día seguido (el 7.º es el gordo); si pasa un día sin entrar, la racha vuelve
// al día 1. El día cuenta por el calendario del dispositivo (cambia a medianoche). Como en todo juego de un
// solo jugador, cambiar la hora del aparato permite hacer trampa; aquí no importa.
import { DAILY, RESOURCES } from '../data/config.js';
import { resourceCap, townHallLevel } from './logic.js';

/** Número del día del calendario LOCAL (aumenta en 1 cada medianoche). */
export function dayNumber(now = Date.now()) {
  const d = new Date(now);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** Qué día de la racha (1–7) toca reclamar si hoy no se ha reclamado; si ya se reclamó, el de hoy. */
export function dailyDay(state, now = Date.now()) {
  const today = dayNumber(now);
  const { day: last, streak } = state.daily;
  if (today <= last) return Math.max(1, streak); // ya reclamado hoy (o el reloj retrocedió)
  const continues = last > 0 && today - last === 1;
  if (!continues) return 1;
  return streak >= DAILY.days ? 1 : streak + 1;
}

/** ¿Hay un premio por reclamar hoy? */
export const dailyAvailable = (state, now = Date.now()) => dayNumber(now) > state.daily.day;

/** Lo que da el día `day` (1–7) con el Ayuntamiento actual: { gold, wood }. */
export function dailyReward(state, day) {
  const k = (1 + DAILY.perHallLevel * (townHallLevel(state) - 1)) * DAILY.multipliers[Math.min(DAILY.days, Math.max(1, day)) - 1];
  return Object.fromEntries(RESOURCES.map((r) => [r, Math.round(DAILY.base[r] * k)]));
}

/** Reclama el premio de hoy. Lo que pasa del tope de recursos no entra. Devuelve { ok, day, reward (lo que entró) }. */
export function claimDaily(state, now = Date.now()) {
  if (!dailyAvailable(state, now)) return { ok: false, reason: 'Ya reclamaste el premio de hoy' };
  const day = dailyDay(state, now);
  const give = dailyReward(state, day);
  const cap = resourceCap(state);
  const reward = {};
  for (const r of RESOURCES) {
    const before = state[r];
    state[r] = Math.max(before, Math.min(cap, before + give[r]));
    reward[r] = state[r] - before;
  }
  state.daily = { day: dayNumber(now), streak: day };
  return { ok: true, day, reward, offered: give };
}
