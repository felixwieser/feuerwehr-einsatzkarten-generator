import { config } from '@/lib/config';
import type { RouteResult, RouteStep, RouteSegmentSplit } from '@/lib/types';

// Anbindung an OSRM (Open Source Routing Machine).
// Funktioniert sowohl mit dem öffentlichen Demo-Server als auch mit einer
// eigenen, per Docker gehosteten Instanz (siehe docker-compose.yml).

/**
 * Wandelt einen rohen OSRM-"maneuver" in eine einfache, englischsprachige
 * Anweisung um (z. B. "turn right onto Nordendstraße"). Das ist bewusst
 * einfach gehalten (kein vollwertiger Ersatz für eine Bibliothek wie
 * osrm-text-instructions) - der Zweck ist lediglich, der KI (siehe
 * src/lib/claude.ts) verständliches Rohmaterial zu liefern, aus dem sie
 * die kurze deutsche Notation ("re."/"li." etc.) erzeugt.
 */
function maneuverToInstruction(step: any): string {
  const name = step.name || step.destinations || 'unnamed road';
  const type = step.maneuver?.type;
  const modifier = step.maneuver?.modifier as string | undefined;

  const modifierWord = (modifier || '').replace('slight ', 'slight_');

  switch (type) {
    case 'depart':
      return `Start, head onto ${name}`;
    case 'arrive':
      return `Arrive at destination on ${name}`;
    case 'turn':
      return `Turn ${modifierWord || 'straight'} onto ${name}`;
    case 'new name':
      return `Continue onto ${name}`;
    case 'continue':
      return `Continue ${modifierWord || 'straight'} onto ${name}`;
    case 'merge':
      return `Merge ${modifierWord || ''} onto ${name}`.trim();
    case 'on ramp':
      return `Take the ramp onto ${name}`;
    case 'off ramp':
      return `Take the exit onto ${name}`;
    case 'fork':
      return `At the fork, keep ${modifierWord || 'straight'} onto ${name}`;
    case 'end of road':
      return `At the end of the road, turn ${modifierWord || ''} onto ${name}`.trim();
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return `At the roundabout, take the exit onto ${name}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout onto ${name}`;
    default:
      return `Continue onto ${name}`;
  }
}

function parseSteps(osrmSteps: any[]): RouteStep[] {
  return osrmSteps
    // "depart" auf dem ersten und "arrive" auf dem letzten Step behalten
    // wir, alle Steps mit leerem Namen (z. B. namenlose Parkplatzausfahrten)
    // lassen wir weg, da sie die KI-Eingabe nur unnötig aufblähen.
    .filter((s) => s.name || s.maneuver?.type === 'arrive' || s.maneuver?.type === 'depart')
    .map((s) => ({
      instruction: maneuverToInstruction(s),
      streetName: s.name || '',
    }));
}

export async function getRoute(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<RouteResult | null> {
  const coords = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    annotations: 'false',
  });
  const url = `${config.osrm.url}/route/v1/driving/${coords}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `OSRM-Anfrage fehlgeschlagen (Status ${res.status}). Ist die URL in ` +
        `OSRM_URL korrekt und der Dienst erreichbar?`
    );
  }
  const data = await res.json();

  if (data.code !== 'Ok' || !data.routes?.length) {
    return null;
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  // Letzter "echter" Fahr-Schritt vor dem Ankunfts-Manöver (arrive) - das
  // ist die tatsächliche Zielstraße (der arrive-Schritt selbst hat i. d. R.
  // nur einen winzigen "Stub" als Geometrie, den reinen Ankunftspunkt).
  // Dessen erste Koordinate markiert den Übergang von Anfahrtsweg zu
  // Zielstraße für die automatische Kartenausschnitt-Berechnung - siehe
  // splitLastSegment().
  const drivingSteps = (leg.steps as any[]).filter((s) => s.maneuver?.type !== 'arrive');
  const targetStreetStep = drivingSteps[drivingSteps.length - 1];
  const targetStreetStartCoord: [number, number] | null =
    targetStreetStep?.geometry?.coordinates?.[0] ?? null;

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry.coordinates,
    steps: parseSteps(leg.steps),
    targetStreetStartCoord,
  };
}

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
