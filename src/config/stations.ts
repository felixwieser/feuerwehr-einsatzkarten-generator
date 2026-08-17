import type { Station } from '@/lib/types';

// ============================================================================
// BITTE ANPASSEN: Trage hier die echten Feuerwachen eurer Wehr ein.
// ============================================================================
// - id:      interner Schlüssel, frei wählbar, muss eindeutig sein
// - kuerzel: erscheint oben rechts auf der Einsatzkarte, z. B. "FW 4"
// - name:    voller Name, erscheint im Dropdown der Eingabemaske
// - address: nur zur Anzeige/Info
// - lat/lon: Koordinaten des Ausgangspunkts (WGS84). Ermitteln könnt ihr
//            diese z. B. über https://nominatim.openstreetmap.org/ui/search.html
//            (Adresse eingeben, auf Treffer klicken -> Koordinaten stehen
//            im Detail) oder über Google Maps -> Rechtsklick auf den Punkt
//            -> die angezeigten Koordinaten kopieren.
//
// Die unten stehenden Einträge sind nur BEISPIELE (Adressen in München,
// passend zum Beispieltext im System-Prompt unter src/lib/claude.ts) und
// müssen vor dem echten Einsatz durch eure tatsächlichen Wachen ersetzt
// werden!
// ============================================================================

export const stations: Station[] = [
  {
    id: 'fw1',
    kuerzel: 'FW 1',
    name: 'Feuerwache 1',
    address: 'Blumenstraße 22, 80331 München',
    lat: 48.1329,
    lon: 11.5717,
  },
  {
    id: 'fw4',
    kuerzel: 'FW 4',
    name: 'Feuerwache 4',
    address: 'Heßstraße 120, 80797',
    lat: 48.1564,
    lon: 11.5554,
    // Der direkte Weg re. auf Heßstr. -> li. auf Schwere-Reiter-Str. ist für
    // normale Fahrzeuge gesperrt (Routing-Engines finden ihn nie von selbst,
    // auch nicht mit erzwungenem Zwischenpunkt - getestet), aber mit
    // Sondersignal befahrbar. Der Abschnitt wird daher als Fixtext
    // hinterlegt statt berechnet - die eigentliche Routenberechnung
    // beginnt erst ab routeStartPoint (auf der Schwere-Reiter-Str.).
    exitOptions: [
      {
        id: 'links-schwere-reiter-str',
        label: 'Links (über Schwere-Reiter-Str.)',
        fixedPrefix: 're. Heßstr. – li. Schwere-Reiter-Str.',
        // Bewusst NICHT die Adresse "Schwere-Reiter-Str. 2" (zu nah an der
        // Kreuzung zur Heßstr. - ORS ordnete diesen Punkt beim Testen noch
        // der Heßstr. zu, wodurch die berechnete Route direkt nach dem
        // Fixtext wieder "Heßstr." sagte). Dieser Punkt liegt eindeutig
        // weiter auf der Schwere-Reiter-Str. (getestet: Route ab hier
        // beginnt sauber mit "Schwere-Reiter-Straße", kein Zurückspringen).
        routeStartPoint: { lat: 48.1598, lon: 11.5482 },
      },
    ],
  },
];

export const DEFAULT_STATION_ID = stations[0].id;

export function getStationById(id: string): Station | undefined {
  return stations.find((s) => s.id === id);
}
