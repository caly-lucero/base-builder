import Phaser from 'phaser';
import { LAYOUT } from './data/config.js';
import * as prefs from './game/prefs.js';
import { MAX_SAVE_BYTES, parseSave, serialize } from './game/save.js';
import * as store from './game/store.js';
import BaseScene from './scenes/BaseScene.js';
import BattleScene from './scenes/BattleScene.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

// Mensajes siempre como texto (textContent), nunca como HTML.
function setStatus(text) {
  statusEl.textContent = text;
}
store.onStatus(setStatus);

/* ---------- arranque ---------- */

const boot = store.init();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: LAYOUT.width,
  height: LAYOUT.height,
  backgroundColor: '#1b2a1b',
  banner: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [],
});
if (import.meta.env.DEV) window.__game = game; // solo en desarrollo: facilita inspeccionar escenas desde la consola
game.scene.add('BattleScene', BattleScene, false);
game.scene.add('BaseScene', BaseScene, true, { gained: boot.gained });

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

/* ---------- guardado en momentos clave ---------- */

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
  setStatus('Partida importada.');
});

$('btn-reset').addEventListener('click', () => {
  if (!window.confirm('Se borrará tu partida actual y empezarás de cero. ¿Continuar?')) return;
  store.reset();
  setStatus('Nueva partida iniciada.');
});

/* ---------- PWA ---------- */

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sin service worker el juego funciona igual, solo que sin modo offline */
    });
  });
}
