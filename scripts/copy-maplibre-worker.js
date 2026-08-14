// Kopiert die MapLibre-GL-Worker-Datei (+ deren gemeinsamen Chunk) aus
// node_modules nach public/maplibre/, damit die interaktive Kartenanpassung
// im Browser (src/components/MapAdjuster.tsx) den Web-Worker unter einer
// stabilen, von Next.js ausgelieferten URL findet.
//
// HINTERGRUND: MapLibre GL JS lädt seinen Web-Worker relativ zur eigenen
// Skript-URL (import.meta.url). Webpack bündelt das nicht automatisch, weil
// MapLibre die Worker-URL in einer separaten Funktion berechnet statt im
// von Webpack erkannten Inline-Muster "new Worker(new URL(...))" - daher
// muss die Worker-Datei manuell an einem festen Ort bereitgestellt und via
// maplibregl.config.WORKER_URL referenziert werden (siehe MapAdjuster.tsx).
//
// Wird automatisch nach "npm install" ausgeführt (siehe package.json
// "postinstall"), damit die Datei auch nach einem MapLibre-Update aktuell
// bleibt.

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist');
const DEST_DIR = path.join(__dirname, '..', 'public', 'maplibre');

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!fs.existsSync(SRC_DIR)) {
  console.warn('[copy-maplibre-worker] maplibre-gl nicht gefunden, überspringe.');
  process.exit(0);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

for (const file of FILES) {
  const src = path.join(SRC_DIR, file);
  const dest = path.join(DEST_DIR, file);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-maplibre-worker] ${file} nicht gefunden, übersprungen.`);
    continue;
  }
  fs.copyFileSync(src, dest);
  console.log(`[copy-maplibre-worker] ${file} -> public/maplibre/${file}`);
}
