// Puente entre la página (exportar, importar, sonido, nueva partida) y las escenas del juego.
// main.js registra las acciones; el menú del juego las llama. Los avisos de la página (por ejemplo
// «Partida exportada») llegan a la escena como un aviso en pantalla.
const actions = {};
const listeners = new Set();

/** Registra las acciones: { export, import, reset, toggleSound, isSoundOn }. */
export const registerMenu = (a) => Object.assign(actions, a);

/** Ejecuta una acción del menú (si existe). */
export const runMenu = (name) => actions[name]?.();

export const isSoundOn = () => actions.isSoundOn?.() ?? true;

/** Avisa algo al jugador (lo muestra la escena activa). */
export function notice(text) {
  for (const fn of listeners) fn(text);
}

export function onNotice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
