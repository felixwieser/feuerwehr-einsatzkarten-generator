import { config } from '@/lib/config';
import { knownShortcuts } from '@/config/knownShortcuts';
import type { RouteResult, RouteStep, RouteSegmentSplit, GeoPoint } from '@/lib/types';

// Anbindung an openrouteservice (ORS, https://openrouteservice.org) für das
// Routing - ersetzt das frühere OSRM. Genutzt wird bewusst das normale
// "driving-car"-Profil (siehe config.ts, Abschnitt "ors" für die Begründung):
// ein echtes LKW-Profil vermeidet pauschal Autobahnen und Durchfahrts-
// beschränkungen, die für Einsatzfahrzeuge unter Blaulicht rechtlich gar
// nicht gelten. Stattdessen wird die normale PKW-Route nachträglich gezielt
// auf ECHTE physische Engstellen (zu niedrige Unterführungen/Brücken)
// geprüft, siehe avoidHeightRestrictions() unten.

const ORS_PROFILE = 'driving-car';

// -----------------------------------------------------------------------
// Geometrie-Hilfsfunktionen (providerunabhängig, unverändert von früher)
// -----------------------------------------------------------------------

/** Haversine-Distanz in Metern zwischen zwei [lon, lat]-Punkten */
function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function minDistanceToLine(point: [number, number], line: [number, number][]): number {
  let min = Infinity;
  for (const p of line) {
    const d = distanceMeters(point, p);
    if (d < min) min = d;
  }
  return min;
}

/** Kompass-Peilung in Grad (0 = Norden) von a nach b, Luftlinie. */
function bearingDegrees(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS_CENTER_DEGREES: Record<import('@/config/knownShortcuts').CompassDirection, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

/** true, wenn die Peilung von a nach b ungefähr (±45°) in die angegebene Himmelsrichtung zeigt. */
function isRoughlyInDirection(
  a: [number, number],
  b: [number, number],
  direction: import('@/config/knownShortcuts').CompassDirection
): boolean {
  const bearing = bearingDegrees(a, b);
  const center = COMPASS_CENTER_DEGREES[direction];
  const diff = Math.abs(((bearing - center + 540) % 360) - 180);
  return diff <= 45;
}

function bboxOfLine(line: [number, number][], padDeg = 0.01) {
  const lons = line.map((p) => p[0]);
  const lats = line.map((p) => p[1]);
  return {
    minLon: Math.min(...lons) - padDeg,
    maxLon: Math.max(...lons) + padDeg,
    minLat: Math.min(...lats) - padDeg,
    maxLat: Math.max(...lats) + padDeg,
  };
}

// -----------------------------------------------------------------------
// ORS Directions API
// -----------------------------------------------------------------------

interface OrsStep {
  distance: number;
  duration: number;
  type: number;
  instruction: string;
  name: string;
  way_points: [number, number];
}

interface OrsFeature {
  geometry: { coordinates: [number, number][] };
  properties: {
    segments: { distance: number; duration: number; steps: OrsStep[] }[];
    // [startWaypointIdx, endWaypointIdx, waytype-Code] - siehe
    // scoreRoadHierarchy() weiter unten für die Bedeutung der Codes.
    extras?: { waytype?: { values: [number, number, number][] } };
  };
}

type AvoidGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

/**
 * Fragt (eine oder mehrere) Routen bei ORS ab. coordinates sind [lon,
 * lat]-Paare, mind. 2 (Start + Ziel), optional mit Via-Punkten dazwischen
 * (siehe findApplicableShortcuts()). avoidPolygons blendet gezielt Flächen
 * aus (siehe avoidHeightRestrictions()). alternatives fordert bis zu 3
 * Routenalternativen inkl. Straßenklassen-Info an (siehe
 * pickBestRoadHierarchyRoute()) - nur sinnvoll/unterstützt bei genau 2
 * Koordinaten (Start+Ziel ohne Via-Punkte). Gibt ein leeres Array zurück,
 * wenn ORS keine Route findet (analog zum früheren OSRM-Verhalten).
 */
async function requestOrsRoutes(
  coordinates: [number, number][],
  opts?: { avoidPolygons?: AvoidGeometry; alternatives?: boolean }
): Promise<OrsFeature[]> {
  const body: Record<string, unknown> = {
    coordinates,
    instructions: true,
    // Bewusst Englisch, nicht Deutsch: die KI-Übersetzung (siehe claude.ts
    // und die Few-Shot-Beispiele in routeDescriptionExamples.ts) geht von
    // rohen, englischsprachigen Anweisungen aus.
    language: 'en',
  };
  if (opts?.avoidPolygons) {
    body.options = { avoid_polygons: opts.avoidPolygons };
  }
  if (opts?.alternatives) {
    body.alternative_routes = { target_count: 3, weight_factor: 1.6, share_factor: 0.6 };
    body.extra_info = ['waytype'];
  }

  const res = await fetch(`${config.ors.url}/v2/directions/${ORS_PROFILE}/geojson`, {
    method: 'POST',
    headers: {
      Authorization: config.ors.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 404) {
    // ORS liefert 404 (statt einer leeren Route), wenn keine Route
    // gefunden werden kann (z. B. keine Wegverbindung) - analog zum
    // früheren "code !== 'Ok'" bei OSRM.
    return [];
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `ORS-Anfrage fehlgeschlagen (Status ${res.status}). Ist ORS_API_KEY korrekt ` +
        `und das Tageslimit nicht ausgeschöpft? Details: ${detail.slice(0, 300)}`
    );
  }
  const data = await res.json();
  return (data.features ?? []) as OrsFeature[];
}

/** Bequemlichkeits-Wrapper für den (weitaus häufigeren) Fall "nur eine Route". */
async function requestOrsRoute(
  coordinates: [number, number][],
  avoidPolygons?: AvoidGeometry
): Promise<OrsFeature | null> {
  const features = await requestOrsRoutes(coordinates, { avoidPolygons });
  return features[0] ?? null;
}

function routeDurationSeconds(feature: OrsFeature): number {
  return feature.properties.segments.reduce((sum, seg) => sum + seg.duration, 0);
}

function routeDistanceMeters(feature: OrsFeature): number {
  return feature.properties.segments.reduce((sum, seg) => sum + seg.distance, 0);
}

function allSteps(feature: OrsFeature): OrsStep[] {
  return feature.properties.segments.flatMap((seg) => seg.steps);
}

/**
 * true, wenn dieselbe benannte Straße an zwei NICHT direkt aufeinander-
 * folgenden Stellen der Route auftaucht - ein starkes Anzeichen für einen
 * unsinnigen Rückweg/Umweg (z. B. durch einen erzwungenen Via-Punkt, der
 * an einer für die konkrete Zielrichtung ungünstigen Stelle liegt - siehe
 * Kommentar bei der Verwendung in getRoute()). Ein reiner Zeitvergleich
 * allein erkennt so etwas nicht zuverlässig, da ein Umweg auf dem Papier
 * trotzdem knapp "schneller" sein kann.
 */
function hasBacktrackingStreetRevisit(feature: OrsFeature): boolean {
  const seen = new Set<string>();
  let lastStreet: string | null = null;
  for (const s of allSteps(feature)) {
    const street = s.name === '-' ? null : s.name;
    if (!street || street === lastStreet) continue;
    if (seen.has(street)) return true;
    seen.add(street);
    lastStreet = street;
  }
  return false;
}

// -----------------------------------------------------------------------
// "Große Straßen zuerst" - für Kolonnenfahrten ist der Streckenanfang auf
// größeren Straßen leichter zu fahren als auf engen Nebenstraßen. ORS bietet
// dafür keine eingebaute Einstellung - stattdessen holen wir uns mehrere
// Routenalternativen (siehe requestOrsRoutes) und bewerten sie anhand der
// ORS-"waytype"-Klassifizierung (siehe extra-info/waytype in der ORS-Doku):
// 1 = Staats-/Bundesstraße (motorway/trunk/primary), 2 = sonstige Straße
// (secondary/tertiary), 3 = Wohn-/Nebenstraße (residential/service). Nur der
// ANFANG der Route (siehe ROAD_HIERARCHY_EARLY_METERS) fließt in die
// Bewertung ein, da es um die Kolonnenformation direkt nach der Ausfahrt
// geht, nicht um die gesamte Strecke.
// -----------------------------------------------------------------------

const ROAD_HIERARCHY_EARLY_METERS = 3000;
const ROAD_HIERARCHY_TIME_TOLERANCE = 1.15; // max. 15% langsamer als die schnellste Alternative akzeptiert
const WAYTYPE_SCORE: Record<number, number> = { 1: 1, 2: 0.5, 3: 0.05 };

function scoreRoadHierarchy(feature: OrsFeature): number {
  const coords = feature.geometry.coordinates;
  const cumDist: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumDist.push(cumDist[i - 1] + distanceMeters(coords[i - 1], coords[i]));
  }

  const intervals = feature.properties.extras?.waytype?.values ?? [];
  let score = 0;
  for (const [startIdx, endIdx, value] of intervals) {
    const segStart = cumDist[startIdx] ?? 0;
    const segEnd = cumDist[endIdx] ?? segStart;
    const overlapStart = Math.min(segStart, ROAD_HIERARCHY_EARLY_METERS);
    const overlapEnd = Math.min(segEnd, ROAD_HIERARCHY_EARLY_METERS);
    const overlapLen = Math.max(0, overlapEnd - overlapStart);
    if (overlapLen > 0) score += overlapLen * (WAYTYPE_SCORE[value] ?? 0.2);
  }
  return score;
}

/**
 * Holt die Basis-Route für start->end. Fragt dabei nach Möglichkeit mehrere
 * Alternativen an und wählt davon die mit der "größte Straßen zuerst"-
 * Bewertung - aber nur, wenn diese nicht spürbar langsamer ist als die
 * schnellste Alternative (siehe ROAD_HIERARCHY_TIME_TOLERANCE). Schlägt die
 * Alternativen-Anfrage fehl (z. B. von ORS nicht unterstützt/limitiert),
 * fällt das Ganze sauber auf eine einzelne normale Route zurück.
 */
async function requestBaseRoute(coordinates: [number, number][]): Promise<OrsFeature | null> {
  let alternatives: OrsFeature[] = [];
  try {
    alternatives = await requestOrsRoutes(coordinates, { alternatives: true });
  } catch (err) {
    console.warn(
      '[routing.ts] Routenalternativen ("große Straßen zuerst") nicht verfügbar, nutze normale Route:',
      err instanceof Error ? err.message : err
    );
  }
  if (alternatives.length > 1) {
    const fastest = Math.min(...alternatives.map(routeDurationSeconds));
    const eligible = alternatives.filter(
      (f) => routeDurationSeconds(f) <= fastest * ROAD_HIERARCHY_TIME_TOLERANCE
    );
    eligible.sort((a, b) => scoreRoadHierarchy(b) - scoreRoadHierarchy(a));
    return eligible[0] ?? alternatives[0];
  }
  if (alternatives.length === 1) return alternatives[0];
  return requestOrsRoute(coordinates);
}

// -----------------------------------------------------------------------
// Bekannte Abkürzungen (src/config/knownShortcuts.ts)
// -----------------------------------------------------------------------

function findApplicableShortcuts(
  start: GeoPoint,
  target: GeoPoint,
  stationId: string | undefined
): { lat: number; lon: number }[] {
  return knownShortcuts
    .filter((s) => {
      const stationMatches = 'stationId' in s.appliesWhen ? stationId === s.appliesWhen.stationId : true;
      if (!stationMatches) return false;
      if (!s.directionFromStart) return true;
      return isRoughlyInDirection(
        [start.lon, start.lat],
        [target.lon, target.lat],
        s.directionFromStart
      );
    })
    .map((s) => s.viaPoint);
}

// -----------------------------------------------------------------------
// Durchfahrtshöhen-Prüfung (Overpass API gegen OSM-Rohdaten)
// -----------------------------------------------------------------------

/** Parst OSM-Höhenangaben ("3.3", "3,3", "3.3 m", "default", ...). null = nicht auswertbar. */
function parseHeightMeters(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(',', '.');
  if (cleaned === 'default' || cleaned === 'none' || cleaned === 'unknown') return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

interface HeightRestriction {
  wayId: number;
  maxHeightM: number;
  name: string;
  geometry: [number, number][]; // [lon, lat]
}

// Zwei unabhängig betriebene, öffentliche Overpass-Server (gleiche
// OSM-Rohdaten, unterschiedliche Betreiber) - wie bei Nominatim/dem
// früheren OSRM-Demo-Server kostenlos, aber für geringes Volumen gedacht.
// Der zweite dient als Fallback, falls der erste überlastet/nicht
// erreichbar ist (kam beim Testen tatsächlich vor).
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

/**
 * Fragt BEIDE Overpass-Server gleichzeitig ab (nicht nacheinander) und
 * nutzt die erste erfolgreiche Antwort - spürbar schneller als ein
 * sequentieller Fallback, besonders wenn ein Server gerade überlastet ist
 * (Timeout statt schneller Fehlerantwort). Ein gemeinsames Zeitlimit für
 * beide zusammen (nicht pro Server), damit ein hängender Server die
 * Gesamtwartezeit nicht verdoppelt.
 */
async function fetchOverpass(query: string): Promise<any> {
  const controller = new AbortController();
  // Bewusst knapp (nicht z. B. 15s) - ist Overpass gerade überlastet, soll
  // die Kartenerstellung nicht unnötig lange darauf warten (die Höhen-
  // prüfung ist ein Sicherheitsnetz, kein Pflichtschritt, siehe
  // avoidHeightRestrictions()). Ein normal antwortender Server braucht
  // dafür üblicherweise nur 1-3s.
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  const body = 'data=' + encodeURIComponent(query);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    // Ohne expliziten Accept-Header antwortet Overpass Node/undici-Anfragen
    // mit 406 (Content-Negotiation schlägt fehl) - mit curl (eigener
    // Accept-Header/User-Agent) tritt das nicht auf.
    Accept: '*/*',
    'User-Agent': 'einsatzkarten-generator/1.0 (' + (config.nominatim.contactEmail || 'kontakt fehlt') + ')',
  };

  try {
    return await Promise.any(
      OVERPASS_URLS.map(async (url) => {
        const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Overpass-Anfrage an ${url} fehlgeschlagen (Status ${res.status}).`);
        }
        return res.json();
      })
    );
  } catch (err) {
    const detail =
      err instanceof AggregateError ? err.errors.map((e) => String(e)).join('; ') : String(err);
    throw new Error(`Alle Overpass-Server nicht erreichbar: ${detail}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fragt bei Overpass alle Wege mit einer Höhenbeschränkung
 * (maxheight/maxheight:physical) im angegebenen Gebiet ab.
 */
async function fetchHeightRestrictions(
  bbox: ReturnType<typeof bboxOfLine>
): Promise<HeightRestriction[]> {
  const query = `[out:json][timeout:20];
(
  way["maxheight"](${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
  way["maxheight:physical"](${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
);
out geom tags;`;

  const data = await fetchOverpass(query);

  const restrictions: HeightRestriction[] = [];
  for (const el of data.elements ?? []) {
    if (el.type !== 'way' || !el.geometry) continue;
    const tags = el.tags ?? {};
    // "maxheight:physical" (tatsächliche bauliche Höhe) ist verlässlicher
    // als "maxheight" (oft nur das Schild) - wo beide vorhanden sind, den
    // kleineren (=strengeren) Wert nehmen, im Zweifel lieber vorsichtig sein.
    const physical = parseHeightMeters(tags['maxheight:physical']);
    const signed = parseHeightMeters(tags['maxheight']);
    const values = [physical, signed].filter((v): v is number => v !== null);
    if (!values.length) continue;
    restrictions.push({
      wayId: el.id,
      maxHeightM: Math.min(...values),
      name: tags.name || '',
      geometry: el.geometry.map((g: { lat: number; lon: number }) => [g.lon, g.lat]),
    });
  }
  return restrictions;
}

/**
 * Baut aus den Geometrien der gefundenen Engstellen ein GeoJSON-MultiPolygon
 * (kleine Rechtecke, ca. 20m Puffer um jeden Punkt der Engstelle) für ORS'
 * options.avoid_polygons - damit weicht die nächste Routenanfrage gezielt
 * genau dort aus.
 */
function buildAvoidPolygon(restrictions: HeightRestriction[]): AvoidGeometry {
  const padDeg = 0.0002; // ca. 20m
  const polygons = restrictions.map((r) => {
    const lons = r.geometry.map((p) => p[0]);
    const lats = r.geometry.map((p) => p[1]);
    const minLon = Math.min(...lons) - padDeg;
    const maxLon = Math.max(...lons) + padDeg;
    const minLat = Math.min(...lats) - padDeg;
    const maxLat = Math.max(...lats) + padDeg;
    return [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ];
  });
  return { type: 'MultiPolygon', coordinates: polygons };
}

const MAX_HEIGHT_AVOIDANCE_ATTEMPTS = 3;
// Wie nah eine mit Höhenbeschränkung getaggte Stelle an der berechneten
// Route liegen muss, um als "betrifft diese Route" zu gelten (Puffer für
// GPS-/Digitalisierungs-Ungenauigkeiten).
const HEIGHT_RESTRICTION_PROXIMITY_METERS = 20;

/**
 * Prüft eine berechnete Route auf echte, zu niedrige Durchfahrten (siehe
 * config.vehicle.heightM) und weicht bei Bedarf gezielt aus - die restliche
 * Route bleibt dabei die normale, schnelle PKW-Route (siehe Modul-Kommentar
 * oben). Bricht nach MAX_HEIGHT_AVOIDANCE_ATTEMPTS Versuchen ab und nutzt
 * dann die letzte gefundene Route (besser eine mit bekannter Engstelle als
 * gar keine Karte) - das wird klar geloggt.
 *
 * Performance: Overpass wird nur EINMAL abgefragt (großzügig gepuffertes
 * Gebiet um die ursprüngliche Route), nicht erneut bei jedem Umleitungs-
 * versuch - Umleitungen sind ohnehin nur kleine lokale Ausweichmanöver um
 * eine einzelne Engstelle, die bleiben fast immer innerhalb desselben
 * Gebiets. Spart bis zu zwei zusätzliche Overpass-Anfragen pro Karte.
 */
async function avoidHeightRestrictions(
  feature: OrsFeature,
  coordinates: [number, number][]
): Promise<OrsFeature> {
  let restrictions: HeightRestriction[];
  try {
    // Größerer Puffer als früher (0.01 statt 0.005 Grad), da diese eine
    // Abfrage jetzt auch etwaige spätere Umleitungen mit abdecken muss.
    restrictions = await fetchHeightRestrictions(bboxOfLine(feature.geometry.coordinates, 0.01));
  } catch (err) {
    // Overpass nicht erreichbar o. ä. - die Höhenprüfung ist ein
    // zusätzliches Sicherheitsnetz, kein Ersatz für die normale Route.
    // Lieber mit Warnung ohne Prüfung weiterfahren als die ganze
    // Kartenerstellung deswegen abbrechen.
    console.warn(
      '[routing.ts] Durchfahrtshöhen-Prüfung übersprungen (Overpass nicht erreichbar):',
      err instanceof Error ? err.message : err
    );
    return feature;
  }

  return applyHeightAvoidance(feature, coordinates, restrictions, [], 1);
}

/** Prüft `feature` gegen die (bereits geladenen) `restrictions` und weicht bei Bedarf rekursiv aus - ohne erneute Overpass-Anfrage. */
async function applyHeightAvoidance(
  feature: OrsFeature,
  coordinates: [number, number][],
  restrictions: HeightRestriction[],
  knownConflicts: HeightRestriction[],
  attempt: number
): Promise<OrsFeature> {
  const routeLine = feature.geometry.coordinates;
  const newConflicts = restrictions.filter(
    (r) =>
      r.maxHeightM < config.vehicle.heightM &&
      r.geometry.some((p) => minDistanceToLine(p, routeLine) <= HEIGHT_RESTRICTION_PROXIMITY_METERS)
  );

  if (!newConflicts.length) {
    if (knownConflicts.length) {
      console.warn(
        `[routing.ts] Route erfolgreich um ${knownConflicts.length} zu niedrige Durchfahrt(en) ` +
          `umgeleitet: ${knownConflicts.map((c) => c.name || c.wayId).join(', ')}`
      );
    }
    return feature;
  }

  const allConflicts = [...knownConflicts, ...newConflicts];
  console.warn(
    `[routing.ts] Zu niedrige Durchfahrt auf der Route gefunden (Fahrzeughöhe ${config.vehicle.heightM}m): ` +
      newConflicts.map((c) => `${c.name || c.wayId} (${c.maxHeightM}m)`).join(', ') +
      (attempt >= MAX_HEIGHT_AVOIDANCE_ATTEMPTS
        ? ' - maximale Anzahl Umleitungsversuche erreicht, nutze letzte Route trotzdem.'
        : ' - versuche gezielte Umleitung ...')
  );

  if (attempt >= MAX_HEIGHT_AVOIDANCE_ATTEMPTS) {
    return feature;
  }

  const rerouted = await requestOrsRoute(coordinates, buildAvoidPolygon(allConflicts));
  if (!rerouted) {
    // Keine Route mehr möglich, wenn diese Stelle(n) gesperrt sind (z. B.
    // einzige Verbindung) - dann bleibt nur die ursprüngliche Route mit
    // der bekannten Engstelle, klar geloggt.
    console.warn(
      '[routing.ts] Keine Umleitung um die Engstelle(n) möglich, nutze Route mit Engstelle.'
    );
    return feature;
  }
  return applyHeightAvoidance(rerouted, coordinates, restrictions, allConflicts, attempt + 1);
}

// -----------------------------------------------------------------------
// Öffentliche API (Signatur/Rückgabeform bewusst kompatibel zum früheren
// osrm.ts, damit api/process/route.ts nur den Import anpassen musste)
// -----------------------------------------------------------------------

function featureToRouteResult(feature: OrsFeature): RouteResult {
  const steps = allSteps(feature);

  const drivingSteps = steps.filter((s) => s.type !== 10 /* Goal/arrive */);
  const targetStreetStep = drivingSteps[drivingSteps.length - 1];
  const targetIdx = targetStreetStep?.way_points?.[0];
  const targetStreetStartCoord: [number, number] | null =
    typeof targetIdx === 'number' ? feature.geometry.coordinates[targetIdx] ?? null : null;

  const routeSteps: RouteStep[] = steps.map((s) => ({
    // ORS liefert bereits einen fertig formulierten, englischsprachigen
    // Anweisungstext (inkl. sinnvoller Behandlung von Autobahn-Auf-/
    // Abfahrten, Kreisverkehren etc.) - anders als beim früheren OSRM
    // müssen wir den nicht mehr selbst aus dem rohen Manöver zusammenbauen.
    instruction: s.instruction,
    streetName: s.name === '-' ? '' : s.name,
    // Numerischer Manöver-Code + Distanz - werden für die regelbasierte
    // Klartext-Erzeugung genutzt (siehe deterministicDescription.ts).
    maneuverType: s.type,
    distanceMeters: s.distance,
  }));

  return {
    distanceMeters: routeDistanceMeters(feature),
    durationSeconds: routeDurationSeconds(feature),
    geometry: feature.geometry.coordinates,
    steps: routeSteps,
    targetStreetStartCoord,
  };
}

export async function getRoute(
  start: GeoPoint,
  end: GeoPoint,
  opts?: { stationId?: string; routeStartOverride?: { lat: number; lon: number } }
): Promise<RouteResult | null> {
  // Manuell von der Diensthabenden Person gewählte Ausfahrtsrichtung (siehe
  // Station.exitOptions in stations.ts) - der Abschnitt von der Wache bis
  // hierher ist bereits als Fixtext hinterlegt (siehe api/process/route.ts)
  // und wird NICHT berechnet. Die Routing-Engine startet direkt ab hier,
  // ganz normal inkl. Höhenprüfung - kein Zeitvergleich nötig, da die Wahl
  // schon getroffen ist.
  if (opts?.routeStartOverride) {
    const coords: [number, number][] = [
      [opts.routeStartOverride.lon, opts.routeStartOverride.lat],
      [end.lon, end.lat],
    ];
    let feature = await requestOrsRoute(coords);
    if (!feature) return null;
    feature = await avoidHeightRestrictions(feature, coords);
    return featureToRouteResult(feature);
  }

  const baseCoords: [number, number][] = [
    [start.lon, start.lat],
    [end.lon, end.lat],
  ];

  const shortcutViaPoints = findApplicableShortcuts(start, end, opts?.stationId);
  const shortcutCoords: [number, number][] | null = shortcutViaPoints.length
    ? [[start.lon, start.lat], ...shortcutViaPoints.map((v): [number, number] => [v.lon, v.lat]), [end.lon, end.lat]]
    : null;

  // Basis-Route und (falls zutreffend) Abkürzungs-Route sind voneinander
  // unabhängige ORS-Anfragen - parallel statt nacheinander abfragen, das
  // spart eine komplette Anfrage-Rundlaufzeit.
  const [feature, shortcutFeature] = await Promise.all([
    requestBaseRoute(baseCoords),
    shortcutCoords
      ? requestOrsRoute(shortcutCoords).catch((err) => {
          console.warn('[routing.ts] Bekannte Abkürzung fehlgeschlagen, nutze normale Route:', err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  let winner = feature;
  let usedCoords = baseCoords;

  if (feature && shortcutFeature) {
    // Bekannte Abkürzung nur verwenden, wenn sie nicht langsamer ist als
    // die normal berechnete Route (siehe knownShortcuts.ts) UND keinen
    // Rückweg über eine bereits befahrene Straße erzeugt. Der erzwungene
    // Via-Punkt liegt an einer festen Stelle - für Ziele, die "auf der
    // anderen Seite" davon liegen, kann das sonst einen unsinnigen Umweg
    // erzeugen, der auf dem Papier (Gesamtdauer) trotzdem knapp gewinnt
    // (beobachtet: Leonrodstr. wurde zweimal befahren, weil die normale
    // Route den Via-Punkt bereits über Platz der Freiheit erreicht hätte,
    // der Via-Punkt aber am westlichen Ende bei Rotkreuzplatz liegt).
    if (
      routeDurationSeconds(shortcutFeature) <= routeDurationSeconds(feature) &&
      !hasBacktrackingStreetRevisit(shortcutFeature)
    ) {
      winner = shortcutFeature;
      usedCoords = shortcutCoords!;
    }
  } else if (!feature && shortcutFeature) {
    // Normale Route nicht gefunden - Abkürzungs-Route als letzten Versuch
    // nutzen, auch falls sie einen Rückweg enthält (siehe oben) - eine
    // ungewöhnliche Route ist immer noch besser als gar keine.
    if (hasBacktrackingStreetRevisit(shortcutFeature)) {
      console.warn(
        '[routing.ts] Abkürzungs-Route enthält einen Rückweg, wird aber mangels Alternative trotzdem verwendet.'
      );
    }
    winner = shortcutFeature;
    usedCoords = shortcutCoords!;
  }

  if (!winner) return null;

  winner = await avoidHeightRestrictions(winner, usedCoords);

  return featureToRouteResult(winner);
}

/**
 * Extrahiert den letzten Streckenabschnitt (Standard: 400 m, siehe
 * MAP_LAST_SEGMENT_METERS) einer Routen-Geometrie - wird für den
 * Kartenausschnitt auf der Rückseite der Karte verwendet.
 */
export function getLastSegment(
  geometry: [number, number][],
  meters = config.map.lastSegmentMeters
): [number, number][] {
  if (geometry.length < 2) return geometry;

  let acc = 0;
  const result: [number, number][] = [geometry[geometry.length - 1]];
  for (let i = geometry.length - 1; i > 0; i--) {
    acc += distanceMeters(geometry[i], geometry[i - 1]);
    result.unshift(geometry[i - 1]);
    if (acc >= meters) break;
  }
  return result;
}

/**
 * Wie getLastSegment(), teilt den letzten Streckenabschnitt aber zusätzlich
 * an targetStreetStartCoord in Anfahrtsweg (davor) und Zielstraße (danach)
 * auf - die beiden Teilstücke werden nicht mehr eingefärbt, dienen aber
 * weiterhin der automatischen Kartenausschnitt-Berechnung (siehe mapStyle.ts).
 */
export function splitLastSegment(
  geometry: [number, number][],
  targetStreetStartCoord: [number, number] | null,
  meters = config.map.lastSegmentMeters
): RouteSegmentSplit {
  const lastSegment = getLastSegment(geometry, meters);

  if (!targetStreetStartCoord || lastSegment.length < 2) {
    // Kein Split ermittelbar - gesamten sichtbaren Abschnitt als Zielstraße
    // behandeln (besser als eine leere/falsche Anfahrtsweg-Markierung).
    return { approach: [], targetStreet: lastSegment };
  }

  // Nächstgelegenen Punkt zu targetStreetStartCoord im sichtbaren Abschnitt
  // suchen (exakte Übereinstimmung ist wegen Rundung nicht garantiert).
  let splitIndex = 0;
  let minDist = Infinity;
  for (let i = 0; i < lastSegment.length; i++) {
    const d = distanceMeters(lastSegment[i], targetStreetStartCoord);
    if (d < minDist) {
      minDist = d;
      splitIndex = i;
    }
  }

  // splitIndex-Punkt bewusst in BEIDEN Teilstücken enthalten, damit die
  // beiden Linien nahtlos aneinander anschließen (keine Lücke).
  const approach = lastSegment.slice(0, splitIndex + 1);
  const targetStreet = lastSegment.slice(splitIndex);
  return { approach, targetStreet };
}
