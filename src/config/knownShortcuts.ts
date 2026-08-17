// Bekannte, per Hand gepflegte Abkürzungen für Einsatzfahrzeuge, die eine
// normale Routing-Engine nie selbst finden würde - meist weil sie auf
// Privilegien beruhen, die nur Einsatzfahrzeuge unter Blaulicht/Sondersignal
// haben (z. B. ein kurzes Stück entgegen einer Einbahnstraße fahren). Jeder
// Eintrag erzwingt einen "Via-Punkt", durch den die Route zusätzlich
// geführt wird - das eigentliche Routing (inkl. Höhenprüfung an
// Unterführungen) übernimmt weiterhin ORS ganz normal, nur eben MIT diesem
// Zwischenpunkt.
//
// Wie ein Eintrag hinzugefügt wird:
// - appliesWhen.stationId: nur ausprobieren, wenn von dieser Feuerwache
//   gestartet wird (z. B. eine bestimmte Ausfahrt-Route ab der Wache)
// - appliesWhen.always: bei JEDER Fahrt ausprobieren (für Abkürzungen, die
//   nicht an eine Wache gebunden sind, z. B. mitten auf der Strecke)
// - directionFromStart (optional): zusätzlich nur ausprobieren, wenn die
//   Zielstraße ungefähr in dieser Himmelsrichtung von der Startadresse aus
//   liegt (Luftlinie) - für Abkürzungen, die nur in eine Richtung Sinn
//   ergeben
// - viaPoint: der erzwungene Zwischenpunkt (Koordinaten am besten per
//   Rechtsklick "Was ist hier?" in Google Maps oder auf openstreetmap.org
//   ermitteln)
//
// WICHTIG: Egal was oben zutrifft - die Route MIT erzwungenem Via-Punkt
// wird nur tatsächlich verwendet, wenn sie laut ORS nicht LANGSAMER ist als
// die normal berechnete Route (siehe getRoute() in routing.ts). Ein
// fehlerhaft eingetragener Eintrag kann die Fahrt also nicht versehentlich
// verlängern - schlimmstenfalls wird er einfach nie verwendet.

export type CompassDirection = 'north' | 'east' | 'south' | 'west';

export interface KnownShortcut {
  id: string;
  /** Kurze Beschreibung, nur für Wartung/Logs, nicht auf der Karte sichtbar */
  description: string;
  appliesWhen: { stationId: string } | { always: true };
  /** Nur versuchen, wenn die Zielstraße ungefähr in diese Richtung liegt (Luftlinie ab Start) */
  directionFromStart?: CompassDirection;
  viaPoint: { lat: number; lon: number };
}

// Hinweis: die frühere FW4-Abkürzung (li./re. Heßstr. -> Schwere-Reiter-
// Str.) ist NICHT mehr hier - Tests zeigten, dass der direkte Weg für
// normale Fahrzeuge OSM-seitig gesperrt ist. Egal welcher Via-Punkt
// verwendet wurde, ORS fand dafür immer einen Umweg und die Route war
// dadurch nie "nicht langsamer" als die normale Route - der Zeitvergleich
// unten kann diesen Fall also strukturell nicht automatisch erkennen.
// Stattdessen wählt die Diensthabende Person das jetzt manuell in der
// Eingabemaske (siehe Station.exitOptions in stations.ts/types.ts) - dort
// gibt es keinen Zeitvergleich, die Wahl wird immer erzwungen.

export const knownShortcuts: KnownShortcut[] = [
  {
    id: 'leonrodstr-wendl-dietrich-str',
    description:
      'Letztes Stück der Leonrodstraße (Höhe Rotkreuzplatz) entgegen der ' +
      'Einbahnstraße befahren, um direkt auf die Wendl-Dietrich-Str. zu ' +
      'gelangen - spart laut Felix erheblich Zeit gegenüber der offiziell ' +
      'erlaubten Umfahrung. Via-Punkt = östlichstes Ende der Wendl-' +
      'Dietrich-Str. (per Overpass ermittelt, bei Bedarf noch von Felix ' +
      'gegenprüfen/korrigieren).',
    appliesWhen: { always: true },
    viaPoint: { lat: 48.1528872, lon: 11.5321738 },
  },
];
