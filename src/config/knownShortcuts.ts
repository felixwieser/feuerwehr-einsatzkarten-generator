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

export const knownShortcuts: KnownShortcut[] = [
  {
    id: 'fw4-schwere-reiter-str',
    description:
      'Ab Feuerwache 4: auf Heßstr., dann auf die Schwere-Reiter-Str. ' +
      '(li. oder re. je nach genauer Zielrichtung) - laut Felix NICHT nur ' +
      'bei Zielen nördlich der Wache sinnvoll (Testfall Waisenhausstr., ' +
      'West-Nordwest, sollte die Abkürzung ebenfalls nutzen) - der starre ' +
      'Richtungs-Filter wurde deshalb entfernt, der Zeitvergleich unten ' +
      'entscheidet jetzt allein. ACHTUNG: viaPoint zeigt aktuell auf die ' +
      'Adresse "Schwere-Reiter-Str. 2", nicht auf die exakte Abbiege-Ecke ' +
      'Heßstr./Schwere-Reiter-Str. - dadurch fährt die erzwungene Route im ' +
      'Test einen unnötigen Umweg (über Lothstr./Dachauer Str. statt ' +
      'direkt) und wird deshalb meist als "nicht schneller" verworfen. ' +
      'Sobald Felix die genaue Ecken-Koordinate liefert, hier ersetzen.',
    appliesWhen: { stationId: 'fw4' },
    viaPoint: { lat: 48.160587, lon: 11.549806 }, // Schwere-Reiter-Str. 2, 80637 München
  },
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
