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
  // Primärer LLM-Provider für die Anfahrtsbeschreibung: ein lokaler/eigener
  // Ollama-Server. Schlägt die Anfrage dort fehl (nicht erreichbar, Timeout,
  // Fehlerantwort), weicht generateRouteDescription() automatisch auf
  // Anthropic Claude aus (siehe src/lib/claude.ts) - dafür bleibt
  // ANTHROPIC_API_KEY weiterhin nötig, auch wenn Ollama der Normalfall ist.
  ollama: {
    // Auf "false" setzen, um Ollama komplett zu überspringen und direkt
    // Anthropic zu nutzen (z. B. wenn ihr keinen Ollama-Server betreibt -
    // spart sonst bei jeder Anfrage die Wartezeit bis zum Timeout).
    enabled: (process.env.OLLAMA_ENABLED ?? 'true') !== 'false',
    url: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
    // Muss vorher lokal geladen sein: "ollama pull llama3.1"
    model: process.env.OLLAMA_MODEL || 'llama3.1',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 15000),
  },
  anthropic: {
    // Rückfallebene, falls Ollama nicht erreichbar ist oder fehlschlägt
    // (siehe ollama-Konfiguration oben) - wird lazy per required() geprüft
    // (erst wenn tatsächlich auf Anthropic ausgewichen wird), damit die App
    // auch ohne Key startet, solange Ollama zuverlässig läuft.
    get apiKey() {
      return required('ANTHROPIC_API_KEY');
    },
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  },
  // Routing über openrouteservice (ORS) - ersetzt das frühere OSRM. Nutzt
  // bewusst das normale "driving-car"-Profil (nicht "driving-hgv"): ein
  // echtes LKW-Profil vermeidet pauschal Autobahnen/Durchfahrtsbeschränkungen,
  // die für Einsatzfahrzeuge unter Blaulicht rechtlich gar nicht gelten -
  // das hat sich beim Testen als spürbarer, unnötiger Zeitverlust gezeigt.
  // Stattdessen wird die PKW-Route nachträglich gezielt auf ECHTE physische
  // Engstellen geprüft (siehe checkHeightRestrictions() in routing.ts) und
  // nur dort, wo nötig, gezielt umgeleitet.
  ors: {
    // API-Key unter https://openrouteservice.org/dev/#/signup (kostenlos,
    // Standard-Plan reicht: 2000 Anfragen/Tag) - lazy per required(),
    // analog zu anthropic.apiKey.
    get apiKey() {
      return required('ORS_API_KEY');
    },
    url: (process.env.ORS_URL || 'https://api.openrouteservice.org').replace(/\/$/, ''),
  },
  // Maße des größten Fahrzeugs, für das die Anfahrt geplant wird (z. B.
  // Feuerwehr-Fahrzeug) - wird NUR für die Durchfahrtshöhen-Prüfung an
  // Unterführungen/Brücken genutzt (siehe routing.ts). Bewusst KEINE
  // Gewichtsprüfung: Gewichtsbeschränkungen sind i. d. R. Verkehrszeichen
  // (Durchfahrtsverbote), keine physischen Grenzen, und gelten für
  // Einsatzfahrzeuge unter Blaulicht ohnehin nicht - anders als eine zu
  // niedrige Unterführung, die man auch mit Blaulicht nicht "wegdiskutieren"
  // kann.
  vehicle: {
    heightM: Number(process.env.VEHICLE_HEIGHT_M || 3.3),
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
