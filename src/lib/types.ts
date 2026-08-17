// Zentrale Typdefinitionen. Diese Datei hat bewusst KEINE Abhängigkeit zu
// React/Next, damit alle Typen auch von reinen Backend-Funktionen
// (Routing, Geocoding, PDF-Export etc.) genutzt werden können.

/**
 * Manuell wählbare Ausfahrtsrichtung ab einer Wache (siehe InputPanel.tsx
 * und Station.exitOptions unten). Für Fälle, in denen der direkte Weg für
 * normale Fahrzeuge gesperrt ist und nur mit Sondersignal befahren werden
 * darf - eine Routing-Engine kann so eine Strecke grundsätzlich nicht
 * selbst berechnen (auch nicht mit einem erzwungenen Zwischenpunkt, da sie
 * reale Verkehrsbeschränkungen respektiert). Der allererste Abschnitt wird
 * deshalb NICHT berechnet, sondern als fester Text hinterlegt - die
 * Diensthabende Person kennt die Lage vor Ort und wählt das selbst.
 */
export interface StationExitOption {
  id: string;
  /** Beschriftung des Auswahl-Buttons, z. B. "Links (über Schwere-Reiter-Str.)" */
  label: string;
  /**
   * Fest hinterlegter Text für den allerersten Streckenabschnitt (z. B.
   * "re. Heßstr. – li. Schwere-Reiter-Str.") - wird der KI-generierten
   * Beschreibung als reiner Text vorangestellt, OHNE von der Routing-
   * Engine berechnet oder von der KI generiert zu werden.
   */
  fixedPrefix: string;
  /**
   * Punkt, an dem der fest hinterlegte Abschnitt endet - die normale
   * Routenberechnung zum Ziel (inkl. Höhenprüfung etc.) beginnt ab hier,
   * NICHT ab der Wache selbst.
   */
  routeStartPoint: { lat: number; lon: number };
}

export interface Station {
  id: string;
  /** Kurzform, z. B. "FW 4" - erscheint oben rechts auf der Karte */
  kuerzel: string;
  /** Voller Name, z. B. "Feuerwache 4" */
  name: string;
  address: string;
  lat: number;
  lon: number;
  /** Optional: manuell wählbare Ausfahrtsrichtungen, siehe StationExitOption */
  exitOptions?: StationExitOption[];
}

export interface GeoPoint {
  lat: number;
  lon: number;
  /** Für die Anzeige, z. B. die von Nominatim gelieferte Adresse */
  label: string;
}

/** Ein einzelner Kandidat aus der Nominatim-Suche (bei Mehrdeutigkeit) */
export interface GeoCandidate {
  lat: number;
  lon: number;
  label: string;
  osmId?: string;
}

export interface RouteStep {
  /** Roher, englischsprachiger Anweisungstext (Basis für die KI-Übersetzung) */
  instruction: string;
  streetName: string;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  /** [lon, lat]-Paare, wie von OSRM (GeoJSON) geliefert */
  geometry: [number, number][];
  steps: RouteStep[];
  /**
   * Erste Koordinate des letzten "echten" Fahr-Schritts vor dem
   * Ankunfts-Manöver (arrive) - markiert den Übergang von Anfahrtsweg zu
   * Zielstraße im Kartenausschnitt. null, falls nicht ermittelbar (z. B.
   * Start == Ziel).
   */
  targetStreetStartCoord: [number, number] | null;
}

/** Anfahrtsweg und Zielstraße getrennt - nur für die Kartenausschnitt-Berechnung, keine Einfärbung */
export interface RouteSegmentSplit {
  approach: [number, number][];
  targetStreet: [number, number][];
}

/** Ergebnis von POST /api/process, wenn eine Zieladresse mehrdeutig war */
export interface AmbiguousResult {
  status: 'ambiguous-start' | 'ambiguous-target';
  candidates: GeoCandidate[];
}

export interface ProcessErrorResult {
  status: 'error';
  message: string;
}

export interface ProcessSuccessResult {
  status: 'ok';
  resolvedStart: GeoPoint;
  resolvedTarget: GeoPoint;
  station: string;
  district: string;
  description: string;
  mapImagePath: string;
  /**
   * Anfahrtsweg/Zielstraße getrennt (siehe RouteSegmentSplit) - wird für die
   * interaktive Kartenanpassung (Neu-Rendern via /api/map-preview) benötigt,
   * damit dafür nicht erneut Geocoding/Routing/KI-Beschreibung laufen muss.
   */
  routeSegments: RouteSegmentSplit;
  /** Vector-Tile-Style-URL (siehe config.map.styleUrl) - für die interaktive
   * Kartenanpassung im Browser (MapAdjuster.tsx), damit dort exakt derselbe
   * Kartenstil wie serverseitig verwendet wird. */
  mapStyleUrl: string;
  /** Standard-Zoomstufe (siehe config.map.zoom) - Ausgangspunkt für die
   * interaktive Kartenanpassung. */
  mapDefaultZoom: number;
}

export type ProcessResult =
  | ProcessSuccessResult
  | AmbiguousResult
  | ProcessErrorResult;

/** Vollständiger, editierbarer Datensatz einer Einsatzkarte */
export interface CardData {
  id?: number;
  startpointLabel: string;
  startpointLat: number;
  startpointLon: number;
  targetStreet: string;
  targetLat: number;
  targetLon: number;
  station: string;
  district: string;
  description: string;
  mapImagePath: string;
}

export interface CardRecord extends CardData {
  id: number;
  createdAt: string;
  updatedAt: string;
}
