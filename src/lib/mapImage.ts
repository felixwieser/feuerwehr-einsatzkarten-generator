import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import type { Server } from 'node:http';
import { config } from '@/lib/config';
import { getBrowser } from '@/lib/browser';
import { onStyleLoad, onMapLoaded } from '@/lib/mapStyle';

// Erzeugt den Kartenausschnitt für die Rückseite der Einsatzkarte:
// MapLibre GL JS rendert Vector-Tiles in einem unsichtbaren Headless-Browser,
// das Ergebnis wird als PNG-Bild abfotografiert.
//
// HINWEIS ZU DEN KARTENKACHELN: Standardmäßig wird der öffentliche,
// kostenlose Vector-Tile-Dienst von https://openfreemap.org verwendet (kein
// API-Key nötig). Für Dauerbetrieb mit vielen Karten könnt ihr über die
// Umgebungsvariable MAP_STYLE_URL einen eigenen, OpenMapTiles-kompatiblen
// Tile-Server angeben (siehe config.ts).
//
// WARUM VECTOR-TILES STATT KLASSISCHER RASTER-KACHELN: Damit sich einzelne
// Kartenebenen ("Layer") gezielt aus-/einblenden lassen (z. B. Points of
// Interest ausblenden, aber Straßennamen und Hausnummern behalten), braucht
// es Kontrolle über die einzelnen Layer - das geht nur mit Vector-Tiles und
// einem Renderer wie MapLibre GL JS, nicht mit vorgerenderten Raster-Bildern
// wie zuvor (Leaflet + OSM-Kacheln).
//
// Die eigentlichen Style-Anpassungen (POIs ausblenden, Hausnummern, Route
// einfärben) leben in src/lib/mapStyle.ts - diese Datei wird sowohl hier
// (serverseitig, per .toString() in die Headless-Browser-Seite eingebettet)
// als auch von der interaktiven Kartenanpassung im Browser des Nutzers
// verwendet (siehe MapAdjuster.tsx), damit beide exakt gleich aussehen.

const MAPLIBRE_DIST = path.join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist');

interface StaticAsset {
  content: string;
  contentType: string;
}

// maplibre-gl.mjs UND maplibre-gl-worker.mjs importieren beide intern noch
// eine gemeinsame Chunk-Datei (maplibre-gl-shared.mjs) - statt jede Datei
// einzeln fest zu verdrahten, liest dieser Cache beliebige Dateien aus dem
// dist/-Verzeichnis bei Bedarf nach (lazy), damit auch künftige/zusätzliche
// interne Chunks automatisch funktionieren.
const assetCache = new Map<string, StaticAsset>();

function readMaplibreAsset(filename: string): StaticAsset | null {
  const cached = assetCache.get(filename);
  if (cached) return cached;

  const resolved = path.join(MAPLIBRE_DIST, filename);
  // Pfad-Traversal verhindern: der aufgelöste Pfad muss innerhalb von
  // MAPLIBRE_DIST liegen.
  if (!resolved.startsWith(MAPLIBRE_DIST + path.sep) || !fs.existsSync(resolved)) {
    return null;
  }

  const ext = path.extname(filename);
  const contentType =
    ext === '.mjs' || ext === '.js'
      ? 'text/javascript; charset=utf-8'
      : ext === '.css'
        ? 'text/css; charset=utf-8'
        : 'application/octet-stream';

  const asset: StaticAsset = { content: fs.readFileSync(resolved, 'utf-8'), contentType };
  assetCache.set(filename, asset);
  return asset;
}

// onStyleLoad/onMapLoaded per .toString() als reinen Funktionstext in die
// Seite einbetten (kein Bundling/Module-Import nötig, da die Funktionen in
// mapStyle.ts bewusst eigenständig sind - siehe Kommentar dort).
const ASSET_SHELL_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="/maplibre-gl.css" />
<style>
  html, body { margin: 0; padding: 0; }
  #map { position: absolute; inset: 0; }
</style>
</head>
<body>
<div id="map"></div>
<script type="module">
  // maplibre-gl.mjs hat KEINEN Default-Export, nur benannte Exports (Map,
  // Marker, config, ...) - daher Namespace-Import statt Default-Import.
  import * as maplibregl from '/maplibre-gl.mjs';
  window.maplibregl = maplibregl;
  window.onStyleLoad = ${onStyleLoad.toString()};
  window.onMapLoaded = ${onMapLoaded.toString()};
  window.__maplibreReady = true;
</script>
</body>
</html>`;

let assetServerPromise: Promise<{ server: Server; port: number }> | null = null;

/**
 * Ein einzelner, lokaler HTTP-Server (127.0.0.1, zufälliger Port), der
 * ausschließlich die statischen MapLibre-Dateien sowie eine minimale
 * HTML-Hülle ausliefert. Das ist notwendig, weil MapLibre GL JS seinen
 * Web-Worker relativ zur eigenen Script-URL lädt (import.meta.url) und dafür
 * einen echten http(s)-Origin braucht - ein einfaches page.setContent() mit
 * eingebettetem Code (wie zuvor bei Leaflet) funktioniert dafür nicht, da
 * about:blank keinen http(s)-Origin hat (MapLibre bricht die automatische
 * Worker-Auflösung dann bewusst ab).
 */
function getAssetServer(): Promise<{ server: Server; port: number }> {
  if (!assetServerPromise) {
    assetServerPromise = new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = req.url || '/';
        if (url === '/' || url === '') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(ASSET_SHELL_HTML);
          return;
        }
        const filename = decodeURIComponent(url.replace(/^\/+/, '').split('?')[0]);
        const asset = readMaplibreAsset(filename);
        if (!asset) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': asset.contentType });
        res.end(asset.content);
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('Konnte lokalen Asset-Server für MapLibre nicht starten.'));
          return;
        }
        resolve({ server, port: addr.port });
      });
    });
  }
  return assetServerPromise;
}

/**
 * Läuft im Browser-Kontext (wird per page.evaluate() serialisiert und dort
 * ausgeführt) - darf daher NICHT auf Variablen aus dem umgebenden
 * Node-Scope zugreifen, nur auf die übergebenen `opts` sowie Browser-Globals
 * (window, document, ...). window.onStyleLoad/window.onMapLoaded wurden
 * bereits beim Seitenaufbau bereitgestellt (siehe ASSET_SHELL_HTML oben).
 */
async function buildMapInBrowser(opts: {
  targetLat: number;
  targetLon: number;
  routeApproach: [number, number][]; // [lon, lat], wie von OSRM/GeoJSON
  routeTargetStreet: [number, number][];
  zoom: number;
  styleUrl: string;
  /** Exakter, vom Nutzer in der interaktiven Vorschau gewählter
   * Kartenausschnitt (aus map.getBounds()) als [[west, south], [east, north]]
   * in [lon, lat] - wenn gesetzt, wird dieser 1:1 übernommen (kein
   * automatisches fitBounds). Bewusst als geografische bounds statt
   * center+zoom übergeben: die Vorschau läuft in einem viel kleineren
   * Browser-Container als dieser Server-Screenshot (1490x1050px). Bei
   * MapLibre hängt die bei einem bestimmten Zoom sichtbare Kartenfläche von
   * der Container-Pixelgröße ab (mehr Pixel = mehr sichtbare Fläche bei
   * gleichem Zoom) - center+zoom 1:1 zu übernehmen würde hier also einen
   * völlig anderen (deutlich weiter rausgezoomt wirkenden) Ausschnitt
   * ergeben. Geografische bounds sind dagegen unabhängig von der
   * Container-Pixelgröße - vorausgesetzt, beide Container haben dasselbe
   * Seitenverhältnis (hier: beide 210:148, siehe MapAdjuster.tsx). */
  bounds?: [[number, number], [number, number]];
}): Promise<void> {
  const maplibregl = (window as any).maplibregl;
  const onStyleLoadFn = (window as any).onStyleLoad;
  const onMapLoadedFn = (window as any).onMapLoaded;

  // Worker-URL explizit setzen: unsere HTML-Hülle wird per <script
  // type="module"> INLINE eingebettet (nicht per <script src="...">), daher
  // liefert MapLibres eigene import.meta.url-Erkennung nicht die erwartete
  // "eigene Script-URL" - wir zeigen stattdessen direkt auf die vom
  // lokalen Asset-Server ausgelieferte Worker-Datei.
  maplibregl.config.WORKER_URL = new URL('/maplibre-gl-worker.mjs', window.location.href).href;

  const map = new maplibregl.Map({
    container: 'map',
    style: opts.styleUrl,
    // Startwert, wird gleich nach dem Laden per fitBounds()/jumpTo() unten
    // sowieso überschrieben - hier nur nötig, damit die Karte überhaupt
    // sinnvoll initialisiert.
    center: [opts.targetLon, opts.targetLat],
    zoom: opts.zoom,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });

  // Warten, bis der Style (inkl. Sprite/Glyphen-Metadaten) geladen ist -
  // mit Timeout, damit ein nicht erreichbarer MAP_STYLE_URL die Anfrage
  // nicht endlos hängen lässt. onStyleLoad() (Hausnummern-Layer) MUSS beim
  // "style.load"-Event laufen, nicht erst nach "load" - siehe Kommentar in
  // mapStyle.ts.
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Kartenstil (${opts.styleUrl}) konnte nicht innerhalb von 20s geladen werden.`));
    }, 20000);
    map.once('error', (e: any) => {
      clearTimeout(timeoutId);
      reject(e?.error instanceof Error ? e.error : new Error('MapLibre-Fehler beim Laden des Kartenstils.'));
    });
    map.once('style.load', () => onStyleLoadFn(map));
    map.once('load', () => {
      clearTimeout(timeoutId);
      resolve();
    });
  });

  onMapLoadedFn(map, { approach: opts.routeApproach, targetStreet: opts.routeTargetStreet });

  function fitToCoords(coords: [number, number][]): void {
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 30, animate: false }
    );
  }

  if (opts.bounds) {
    // Nutzer hat den Kartenausschnitt in der interaktiven Vorschau selbst
    // gewählt - dessen exakten geografischen Ausschnitt übernehmen (siehe
    // ausführliche Begründung im bounds-Parameter-Kommentar oben).
    map.fitBounds(opts.bounds, { padding: 0, animate: false });
  } else {
    const allCoords = [...opts.routeApproach, ...opts.routeTargetStreet];
    if (allCoords.length > 1) {
      fitToCoords(allCoords);
      // Nach fitBounds sicherstellen, dass der Zoom nicht zu weit rausgezoomt
      // ist (Mindest-Zoomstufe für lesbare Details/Hausnummern). Passt bei
      // dieser Zoomstufe nicht der GESAMTE Anfahrtsweg+Zielstraße-Bereich
      // ins Bild, wird stattdessen erneut auf Zielstraße+Zielpunkt allein
      // eingepasst - Ziel und Zielstraße müssen immer sichtbar bleiben,
      // auch wenn dafür ein Teil des (weiter entfernten) Anfahrtswegs aus
      // dem Kartenausschnitt fällt.
      if (map.getZoom() < opts.zoom) {
        const targetCoords: [number, number][] = [
          ...opts.routeTargetStreet,
          [opts.targetLon, opts.targetLat],
        ];
        if (targetCoords.length > 1) {
          fitToCoords(targetCoords);
        }
        if (map.getZoom() < opts.zoom) {
          map.jumpTo({ center: map.getCenter(), zoom: opts.zoom });
        }
      }
    } else {
      map.jumpTo({ center: [opts.targetLon, opts.targetLat], zoom: opts.zoom });
    }
  }

  // Ziel-Marker
  new maplibregl.Marker({ color: '#e5352b' }).setLngLat([opts.targetLon, opts.targetLat]).addTo(map);

  // Warten, bis alle sichtbaren Kacheln fertig geladen/gerendert sind -
  // ebenfalls mit Timeout als Absicherung.
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Kartenkacheln konnten nicht innerhalb von 30s vollständig geladen werden.'));
    }, 30000);
    map.once('idle', () => {
      clearTimeout(timeoutId);
      resolve();
    });
  });

  (window as any).__mapRenderComplete = true;
}

/**
 * Rendert den Kartenausschnitt und speichert ihn als PNG unter
 * GENERATED_DIR. Gibt den öffentlichen Pfad zurück (z. B. "/generated/xyz.png"),
 * unter dem die Datei über Next.js aus dem public/-Ordner ausgeliefert wird.
 */
export async function generateMapImage(opts: {
  targetLat: number;
  targetLon: number;
  routeApproach: [number, number][]; // [lon, lat]
  routeTargetStreet: [number, number][]; // [lon, lat]
  /** Manuell gewählter Kartenausschnitt aus der interaktiven Vorschau
   * (MapAdjuster.tsx), als [[west, south], [east, north]] - wenn gesetzt,
   * kein automatisches fitBounds. */
  bounds?: [[number, number], [number, number]];
  zoom?: number;
}): Promise<string> {
  const width = config.map.width;
  const height = config.map.height;

  const { port } = await getAssetServer();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height });
    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForFunction(() => (window as any).__maplibreReady === true, {
      timeout: 15000,
    });

    await page.evaluate(buildMapInBrowser, {
      targetLat: opts.targetLat,
      targetLon: opts.targetLon,
      routeApproach: opts.routeApproach,
      routeTargetStreet: opts.routeTargetStreet,
      zoom: opts.zoom ?? config.map.zoom,
      styleUrl: config.map.styleUrl,
      bounds: opts.bounds,
    });
    await page.waitForFunction(() => (window as any).__mapRenderComplete === true, {
      timeout: 60000,
    });

    const mapElement = await page.$('#map');
    if (!mapElement) throw new Error('Karten-Element konnte nicht gefunden werden.');

    const dir = path.resolve(process.cwd(), config.generatedDir);
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${crypto.randomUUID()}.png`;
    const filePath = path.join(dir, filename);
    await mapElement.screenshot({ path: filePath as `${string}.png` });

    return `/generated/${filename}`;
  } finally {
    await page.close();
  }
}
