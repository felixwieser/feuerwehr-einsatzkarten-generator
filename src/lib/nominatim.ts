import { config } from '@/lib/config';
import type { GeoCandidate } from '@/lib/types';

// Anbindung an Nominatim (Geocoding & Reverse-Geocoding).
// Funktioniert sowohl mit dem öffentlichen Demo-Server als auch mit einer
// eigenen, per Docker gehosteten Instanz (siehe docker-compose.yml).
//
// Der öffentliche Server verlangt laut Nutzungsbedingungen zwingend einen
// aussagekräftigen User-Agent-Header - siehe
// https://operations.osmfoundation.org/policies/nominatim/

function userAgent(): string {
  const contact = config.nominatim.contactEmail
    ? ` (${config.nominatim.contactEmail})`
    : '';
  return `Feuerwehr-Einsatzkarten-Generator/1.0${contact}`;
}

async function nominatimFetch(pathAndQuery: string): Promise<any> {
  const url = `${config.nominatim.url}${pathAndQuery}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(
      `Nominatim-Anfrage fehlgeschlagen (Status ${res.status}). Ist die URL ` +
        `in NOMINATIM_URL korrekt und der Dienst erreichbar?`
    );
  }
  return res.json();
}

/**
 * Sucht eine Adresse/einen Straßennamen und liefert 0-n Kandidaten zurück.
 * Bei mehreren Treffern muss die aufrufende Stelle den Nutzer auswählen
 * lassen (siehe AmbiguousResult in types.ts).
 */
export async function geocode(
  query: string,
  opts: { limit?: number } = {}
): Promise<GeoCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(opts.limit ?? 5),
  });
  if (config.nominatim.countrycodes) {
    params.set('countrycodes', config.nominatim.countrycodes);
  }
  if (config.nominatim.viewbox) {
    params.set('viewbox', config.nominatim.viewbox);
    params.set('bounded', '1');
  }

  const results = await nominatimFetch(`/search?${params.toString()}`);
  return (results as any[]).map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    label: r.display_name as string,
    osmId: r.osm_id ? String(r.osm_id) : undefined,
  }));
}

/**
 * Kürzt eine von Nominatim gelieferte Adresse (display_name) auf den ersten
 * Bestandteil, z. B. "Marienplatz, Kreuzviertel, Altstadt-Lehel, München,
 * Bayern, 80331, Deutschland" -> "Marienplatz". Nominatim listet den
 * konkreten Treffer (Straße/Platz/POI) immer zuerst, gefolgt von den
 * umgebenden Gebieten (Stadtteil, Stadt, PLZ, Land) - Stadtteil wird an
 * anderer Stelle bereits separat per reverseGeocodeDistrict() ermittelt,
 * die PLZ wird auf der Karte gar nicht angezeigt.
 *
 * SONDERFALL HAUSNUMMER ZUERST: Bei manchen (v. a. innerstädtischen)
 * Adressen liefert Nominatim die Hausnummer als allerersten Bestandteil,
 * z. B. "20, Sendlinger Straße, Hackenviertel, ..." statt der sonst
 * üblichen Reihenfolge "Sendlinger Straße 20". Ohne Sonderbehandlung würde
 * hier nur "20" übrig bleiben. Ist der erste Bestandteil rein numerisch
 * (ggf. mit Buchstaben-Suffix wie "20a"), wird er stattdessen mit dem
 * zweiten Bestandteil (dem eigentlichen Straßennamen) kombiniert.
 */
export function shortStreetLabel(label: string): string {
  const parts = label.split(',').map((p) => p.trim());
  const firstPart = parts[0];
  if (!firstPart) return label;

  const isHouseNumberOnly = /^\d+\s*[a-zA-Z]?$/.test(firstPart);
  if (isHouseNumberOnly && parts[1]) {
    return `${parts[1]} ${firstPart}`;
  }
  return firstPart;
}

/**
 * Ermittelt anhand von Koordinaten den Stadtteil (o. ä.) über Reverse-Geocoding.
 * Nominatim liefert je nach Ort unterschiedliche Adressfelder - wir
 * probieren die gängigsten der Reihe nach durch.
 */
export async function reverseGeocodeDistrict(
  lat: number,
  lon: number
): Promise<string> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '16', // Detailstufe "Stadtteil/Vorort"
  });
  const result = await nominatimFetch(`/reverse?${params.toString()}`);
  const address = result?.address ?? {};

  return (
    address.city_district ||
    address.suburb ||
    address.borough ||
    address.neighbourhood ||
    address.quarter ||
    address.town ||
    address.village ||
    address.city ||
    ''
  );
}
