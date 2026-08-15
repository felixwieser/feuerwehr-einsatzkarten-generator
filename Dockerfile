# Produktions-Image für den Feuerwehr-Einsatzkarten-Generator.
#
# Enthält neben Node.js auch die System-Bibliotheken, die das von Puppeteer
# mitgelieferte Chromium zur Laufzeit braucht (Karten-/PDF-Rendering, siehe
# src/lib/browser.ts) - ein normales "node:20-slim"-Image hat diese nicht
# vorinstalliert, Chromium würde sonst sofort abstürzen.
#
# python3/make/g++ werden nur beim Build gebraucht: better-sqlite3 enthält
# nativen Code, der beim "npm ci" per node-gyp lokal kompiliert wird - ohne
# diese Tools bricht der Build mit "Could not find any Python installation"
# ab.
#
# WICHTIG: Node 22, nicht 20! better-sqlite3@13 verlangt laut eigenem
# package.json Node >=22 ("engines") - mit Node 20 kompiliert npm es zwar
# trotzdem (nur eine EBADENGINE-Warnung, kein Fehler), das resultierende
# native Modul stürzt aber beim ersten "new Database(...)" mit
# Segmentation Fault ab (beobachtet auf einem NUC/Home Assistant OS,
# reproduzierbar sogar mit ":memory:"-Datenbank ohne jede Datei-I/O -
# eindeutig eine Node/V8-ABI-Inkompatibilität, kein Datei- oder
# Umgebungsproblem).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    python3 \
    make \
    g++ \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Nur package*.json + scripts/ zuerst kopieren, damit "npm ci" im
# Docker-Layer-Cache bleibt, solange sich die Abhängigkeiten nicht ändern.
# scripts/ muss dabei sein, weil das postinstall-Skript für den
# MapLibre-Worker (siehe package.json) während "npm ci" läuft und sonst
# "Cannot find module .../copy-maplibre-worker.js" wirft.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# WICHTIG zur Datenpersistenz: Volumes beim Hoster direkt an den
# STANDARD-Pfaden /app/data (Datenbank) und /app/public/generated
# (Kartenbilder) mounten - siehe DEPLOY.md. NICHT per Symlink auf einen
# anderen Ort umleiten: Next.js' Produktions-Server ("next start") liefert
# Dateien unter public/ nicht zuverlässig aus, wenn der Ordner selbst (oder
# ein Elternordner) ein Symlink ist (getestet, liefert 404 statt der Datei
# aus) - das Volume muss also direkt an Ort und Stelle gemountet sein, kein
# Umweg über GENERATED_DIR/DB_PATH-Overrides oder Symlinks nötig, die
# Standard-Pfade passen bereits genau dafür.
CMD ["npm", "start"]
