import Phaser from 'phaser';
import { LAYOUT, fitLayout } from './data/config.js';
import { applyRace, current as currentRace } from './data/races.js';
import { RES, fitRes } from './game/res.js';
import { loadPending } from './game/battleSave.js';
import { notice, registerMenu, registerNewGame } from './game/menu.js';
import * as prefs from './game/prefs.js';
import { MAX_SAVE_BYTES, parseSave, serialize } from './game/save.js';
import * as store from './game/store.js';
import BaseScene from './scenes/BaseScene.js';
import BattleScene from './scenes/BattleScene.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

// Mensajes siempre como texto (textContent), nunca como HTML. Además se muestran dentro del juego.
function setStatus(text) {
  statusEl.textContent = text;
  notice(text);
}
store.onStatus(setStatus);

/* ---------- arranque ---------- */

const boot = store.init();
applyRace(store.get().race); // nombres de la raza (el arte se elige al cargar, en BaseScene)

// Banderas de una sola vez entre recargas (cambiar de raza o empezar de cero recarga la página para cargar otro arte).
function takeFlag(name) {
  try {
    const on = window.sessionStorage.getItem(name) === '1';
    window.sessionStorage.removeItem(name);
    return on;
  } catch {
    return false;
  }
}
const flags = { newGame: takeFlag('bb-newgame'), raceChosen: takeFlag('bb-racechosen') };

fitLayout(window.innerWidth, window.innerHeight); // el lienzo toma la proporción de la pantalla
fitRes(window.innerWidth, window.innerHeight, Number(new URLSearchParams(window.location.search).get('dpr')) || window.devicePixelRatio); // y se dibuja a la resolución real de la pantalla
// Todo texto se dibuja a la resolución del lienzo (si no, saldría borroso al ampliarlo con el zoom de la cámara).
const addText = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function text(x, y, str, style) {
  return addText.call(this, x, y, str, { resolution: RES.k, ...style });
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: LAYOUT.width * RES.k,
  height: Math.round(LAYOUT.height * RES.k),
  backgroundColor: '#1a120b',
  banner: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [],
});
if (import.meta.env.DEV) {
  // solo en desarrollo: facilita inspeccionar escenas y la partida desde la consola
  window.__game = game;
  window.__store = store;
}
game.scene.add('BattleScene', BattleScene, false);
// Una batalla que quedó a medias al cerrar la página: la pantalla de inicio ofrece retomarla.
const pending = boot.source === 'none' ? null : loadPending(store.get());
game.scene.add('BaseScene', BaseScene, true, { gained: boot.gained, title: true, fresh: boot.source === 'none' || flags.newGame, raceChosen: flags.raceChosen, pending });

/* ---------- sonido ---------- */

const soundBtn = $('btn-sound');
function paintSoundButton() {
  const on = !prefs.get().muted;
  soundBtn.textContent = `Sonido: ${on ? 'sí' : 'no'}`;
  soundBtn.setAttribute('aria-pressed', String(on));
}
paintSoundButton();
soundBtn.addEventListener('click', () => {
  prefs.setMuted(!prefs.get().muted);
  game.sound.mute = prefs.get().muted;
  paintSoundButton();
});

// El menú del juego (⚙) usa estos botones de la página, que quedan ocultos.
registerMenu({
  export: () => $('btn-export').click(),
  import: () => $('btn-import').click(),
  reset: () => $('btn-reset').click(),
  toggleSound: () => soundBtn.click(),
  isSoundOn: () => !prefs.get().muted,
});

/* ---------- guardado en momentos clave ---------- */

// Giro del celular: el alto del mapa se calcula al abrir según la pantalla. Si la orientación cambia, se recarga
// (la partida y la batalla en curso se guardan solas al salir) para que el juego vuelva a ocupar toda la pantalla.
const wasPortrait = window.innerHeight >= window.innerWidth;
let rotateTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(rotateTimer);
  rotateTimer = setTimeout(() => {
    if (window.innerHeight >= window.innerWidth === wasPortrait) return;
    store.persist();
    window.location.reload();
  }, 500);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.persist();
});
window.addEventListener('pagehide', () => store.persist());

/* ---------- exportar / importar / nueva partida ---------- */

$('btn-export').addEventListener('click', () => {
  store.persist();
  const blob = new Blob([serialize(store.get())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `base-builder-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus('Partida exportada.');
});

const fileInput = $('file-import');
$('btn-import').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = ''; // permite elegir el mismo archivo otra vez
  if (!file) return;

  if (file.size > MAX_SAVE_BYTES) {
    setStatus('Ese archivo es demasiado grande para ser una partida.');
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    setStatus('No se pudo leer el archivo.');
    return;
  }

  const result = parseSave(text);
  if (!result.ok) {
    setStatus(`No se importó: ${result.error}.`);
    return;
  }
  if (!window.confirm('Esto reemplazará tu partida actual. ¿Continuar?')) return;

  store.replace(result.state);
  if (result.state.race !== currentRace.race) window.location.reload(); // otra raza = otro arte
  setStatus('Partida importada.');
});

/** Empezar de cero: se recarga la página y al abrir se elige la raza (que trae su propio arte). */
function newGameReload() {
  try {
    window.sessionStorage.setItem('bb-newgame', '1');
  } catch {
    /* sin sessionStorage solo se pierde la pantalla de elegir raza */
  }
  window.location.reload();
}
registerNewGame(newGameReload);

$('btn-reset').addEventListener('click', () => {
  if (!window.confirm('Se borrará tu partida actual y empezarás de cero. ¿Continuar?')) return;
  store.reset();
  newGameReload();
});

/* ---------- PWA ---------- */

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sin service worker el juego funciona igual, solo que sin modo offline */
    });
  });
}
