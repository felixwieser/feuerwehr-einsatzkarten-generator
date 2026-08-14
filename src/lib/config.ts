// Liest alle Einstellungen zentral aus den Umgebungsvariablen (.env).
// So gibt es nur eine Stelle im Code, die process.env direkt anfasst.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Umgebungsvariable ${name} fehlt. Bitte .env.example nach .env kopieren ` +
        `und ausfüllen (siehe README.md).`
    );
  }
  return value;
}

export const config = {
  anthropic: {
    // Wird lazy per required() geprüft (erst wenn die Klartext-Generierung
    // tatsächlich aufgerufen wird), damit die App auch ohne Key startet.
    get apiKey() {
      return required('ANTHROPIC_API_KEY');
    },
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  },
  osrm: {
    url: (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, ''),
  },
  nominatim: {
    url: (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(
      /\/$/,
      ''
    ),
    contactEmail: process.env.NOMINATIM_CONTACT_EMAIL || '',
    countrycodes: process.env.NOMINATIM_COUNTRYCODES || '',
    viewbox: process.env.NOMINATIM_VIEWBOX || '',
  },
  db: {
    path: process.env.DB_PATH || './data/app.db',
  },
  generatedDir: process.env.GENERATED_DIR || './public/generated',
  map: {
    zoom: Number(process.env.MAP_ZOOM || 18),
    // Querformat DIN A5 (210 x 148 mm) bei ~180 DPI. Die Rückseite der
    // Einsatzkarte (Kartenausschnitt) ist bewusst querformatig, waehrend die
    // Vorderseite (Text) im Hochformat bleibt - siehe pdf.ts/CardBack.tsx.
    width: Number(process.env.MAP_IMAGE_WIDTH || 1490),
    height: Number(process.env.MAP_IMAGE_HEIGHT || 1050),
    // Länge des im Kartenausschnitt hervorgehobenen letzten Streckenabschnitts
    lastSegmentMeters: Number(process.env.MAP_LAST_SEGMENT_METERS || 400),
    // Vector-Tile-Style (OpenMapTiles-Schema). OpenFreeMap ist ein freier,
    // kostenloser Vector-Tile-Anbieter ohne API-Key (siehe https://openfreemap.org).
    // Der Style wird zur Laufzeit im Headless-Browser geladen. Für Dauerbetrieb
    // mit vielen Karten könnt ihr hier auch einen eigenen Tile-Server
    // (OpenMapTiles-kompatibel) eintragen.
    styleUrl: process.env.MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
  },
};
