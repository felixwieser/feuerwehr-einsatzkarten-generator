// Gemeinsame MapLibre-Style-Anpassungen für den Kartenausschnitt der
// Einsatzkarte (POIs ausblenden, 2D-Gebäude statt 3D, Hausnummern ergänzen).
// Anfahrtsweg/Zielstraße werden NICHT mehr farblich markiert (das trägt die
// Feuerwehr von Hand ein) - die Koordinaten dienen nur noch dazu, den
// Kartenausschnitt automatisch passend auf die Route zu zoomen (siehe
// fitToCoords()-Logik in mapImage.ts / MapAdjuster.tsx).
//
// WICHTIG: Diese Datei wird auf zwei Arten verwendet und ist deshalb
// bewusst vollständig eigenständig (keine Imports von anderen App-Modulen,
// kein Node-spezifischer Code, rein browserkompatibel):
//  1. Normal importiert von der interaktiven Client-Komponente
//     (MapAdjuster.tsx) - läuft direkt im Browser des Nutzers.
//  2. Per .toString() als reiner Funktionstext in die vom Headless-Browser
//     gerenderte Seite eingebettet (siehe mapImage.ts), um exakt dasselbe
//     Kartenbild serverseitig für den PDF-Export zu erzeugen. Deshalb
//     dürfen die exportierten Funktionen NICHTS aus dem umgebenden
//     Modul-Scope referenzieren (keine Closures über Imports/Konstanten
//     außerhalb der Funktion) - nur ihre eigenen Parameter, Browser-Globals
//     und selbst verschachtelte Hilfsfunktionen (die landen automatisch mit
//     im .toString()-Text).

export interface MapStyleRouteCoords {
  /**
   * [lon, lat]-Paare des Anfahrtswegs. Wird NICHT mehr auf der Karte
   * eingezeichnet, sondern nur noch für die automatische Zoom-/
   * Ausschnitt-Berechnung verwendet (siehe fitToCoords() in mapImage.ts /
   * MapAdjuster.tsx).
   */
  approach: [number, number][];
  /** [lon, lat]-Paare der Zielstraße - ebenfalls nur für die Ausschnitt-Berechnung. */
  targetStreet: [number, number][];
}

/**
 * Beim "style.load"-Event aufrufen (VOR dem ersten Kachel-Abruf). Fügt den
 * Hausnummern-Layer hinzu.
 *
 * WICHTIG ZUM TIMING: MapLibre parst pro Vector-Tile nur die source-layer,
 * die zum Zeitpunkt des (ersten) Kachel-Abrufs tatsächlich von einem
 * Style-Layer referenziert werden ("lazy bucket creation"). Ein
 * source-layer, der erst NACH dem ersten Laden der Kacheln per addLayer()
 * ergänzt wird, bleibt dauerhaft leer (0 Features), obwohl die Rohdaten in
 * der bereits geladenen Kachel längst vorhanden sind - ein erneutes
 * addLayer() später löst KEIN Nachladen/Neuparsen aus. Deshalb MUSS dieser
 * Layer beim "style.load"-Event (vor "load"/"idle") hinzugefügt werden.
 */
export function onStyleLoad(map: any): void {
  map.addLayer({
    id: 'housenumber-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'housenumber',
    minzoom: 17,
    layout: {
      'text-field': ['get', 'housenumber'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 10,
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#555555',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
    },
  });
}

/**
 * Nach dem "load"-Event aufrufen (Style + erste Kacheln geladen). Blendet
 * POIs und 3D-Gebäude aus. Der Anfahrtsweg/die Zielstraße werden NICHT
 * eingezeichnet (die Feuerwehr trägt die Route von Hand auf der gedruckten
 * Karte ein) - opts dient hier nur noch dem Aufrufer zur Berechnung des
 * passenden Kartenausschnitts (fitToCoords()), nicht dieser Funktion.
 */
export function onMapLoaded(map: any, opts: MapStyleRouteCoords): void {
  // opts wird hier bewusst nicht verwendet - Parameter bleibt aus
  // Kompatibilitätsgründen zur Aufrufer-Signatur (siehe Docstring oben).
  void opts;

  // Nur echte Straßennamen-Text-Layer behalten ("highway-name-*" im
  // "liberty"-Style) - alle anderen Beschriftungen ausblenden, insbesondere
  // auch POIs sowie die "highway-shield-*"/"road_shield_us"-Layer. Letztere
  // gehören zwar ebenfalls zum source-layer "transportation_name" (daher
  // reicht eine reine source-layer-Prüfung NICHT aus), rendern aber nicht
  // nur Straßenschilder (z. B. "A9"), sondern in der Praxis auch
  // Wegweiser-Nummern von U-Bahn-Treppenhäusern/-Ausgängen (OSM-Tag "ref"
  // auf Fußwegen der Klasse "steps" innerhalb von U-Bahnhöfen, z. B.
  // "MP01") - das ist kein Straßenname und würde die Karte unnötig
  // zumüllen.
  const styleLayers = (map.getStyle().layers || []) as any[];
  for (const layer of styleLayers) {
    // Der beim "style.load"-Event ergänzte housenumber-label-Layer ist kein
    // Teil des ursprünglichen Styles - hier nicht mit anfassen (soll
    // sichtbar bleiben).
    if (layer.id === 'housenumber-label') continue;

    if (layer.type === 'symbol') {
      const isStreetNameLayer =
        layer['source-layer'] === 'transportation_name' && String(layer.id).startsWith('highway-name');
      if (!isStreetNameLayer) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    }

    // Gebäude in 3D (fill-extrusion) wirken auf einem flachen, von oben
    // gesehenen Einsatzkarten-Kartenausschnitt eher verwirrend als hilfreich
    // - stattdessen bleibt die flache 2D-Gebäude-Füllung sichtbar (deren
    // maxzoom wird dafür erweitert, s. u.).
    if (layer.type === 'fill-extrusion') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
    if (layer.type === 'fill' && layer['source-layer'] === 'building') {
      map.setLayerZoomRange(layer.id, layer.minzoom ?? 0, 24);
    }
  }
}
