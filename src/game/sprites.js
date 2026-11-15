// Medición de sprites. Las imágenes del pack son lienzos de 64×64 donde el dibujo ocupa
// una parte distinta en cada una (algunas pegadas arriba, otras abajo). Para apoyarlas bien
// sobre una casilla se mide, en el navegador, el rectángulo realmente opaco de cada textura.
const ALPHA_THRESHOLD = 20;
const cache = new Map();

/**
 * Rectángulo opaco de una textura, en píxeles originales:
 * { cx, cy } centro, { bottom } borde inferior, { w, h } tamaño.
 */
export function contentBounds(textures, key) {
  const hit = cache.get(key);
  if (hit) return hit;

  const img = textures.get(key).getSourceImage();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bounds =
    maxX < 0
      ? { cx: width / 2, cy: height / 2, bottom: height, w: width, h: height } // imagen vacía: se usa entera
      : {
          cx: (minX + maxX + 1) / 2,
          cy: (minY + maxY + 1) / 2,
          bottom: maxY + 1,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
        };
  cache.set(key, bounds);
  return bounds;
}
