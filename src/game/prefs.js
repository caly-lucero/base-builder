// Preferencias del dispositivo (hoy solo el sonido). Van aparte de la partida:
// no se exportan ni se importan con ella.
const KEY = 'basebuilder.prefs';
let cache = null;

export function get() {
  if (cache) return cache;
  cache = { muted: false };
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof parsed?.muted === 'boolean') cache.muted = parsed.muted;
  } catch {
    /* sin acceso o dato corrupto: valores por defecto */
  }
  return cache;
}

export function setMuted(muted) {
  get().muted = Boolean(muted);
  try {
    localStorage.setItem(KEY, JSON.stringify({ muted: cache.muted }));
  } catch {
    /* sin almacenamiento: la preferencia dura solo esta sesión */
  }
}
