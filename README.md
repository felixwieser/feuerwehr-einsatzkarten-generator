# Feuerwehr-Einsatzkarten-Generator

Diese App erstellt automatisch **Anfahrtskarten im Format DIN A5** für Feuerwehreinsätze:
Ihr gebt eine Zielstraße ein, die App ermittelt die kürzeste Anfahrt von eurer Feuerwache,
übersetzt die Route in eine kurze Anfahrtsbeschreibung ("re. Nordendstr. – li. Barerstr. – …"),
ermittelt den Stadtteil und erzeugt eine druckfertige, zweiseitige PDF-Karte
(Vorderseite = Text, Rückseite = Kartenausschnitt mit Zielmarkierung).

Diese Anleitung ist für Nicht-Programmierer geschrieben – folgt einfach den Schritten von oben
nach unten.

---

## Inhaltsverzeichnis

1. [Was ihr vorher installieren müsst](#1-was-ihr-vorher-installieren-müsst)
2. [API-Key besorgen (Pflicht)](#2-api-key-besorgen-pflicht)
3. [Projekt einrichten](#3-projekt-einrichten)
4. [App starten](#4-app-starten)
5. [Bedienung](#5-bedienung)
6. [Klartext-Erzeugung: regelbasiert oder KI](#6-klartext-erzeugung-regelbasiert-oder-ki)
7. [Wachen, Ausfahrtsrichtungen und Abkürzungen verwalten](#7-wachen-ausfahrtsrichtungen-und-abkürzungen-verwalten)
8. [Eigenen Nominatim-Server einrichten (optional)](#8-eigenen-nominatim-server-einrichten-optional)
9. [Wo landen die Daten?](#9-wo-landen-die-daten)
10. [Häufige Probleme](#10-häufige-probleme)
11. [App online stellen (eigene Domain)](#11-app-online-stellen-eigene-domain)

---

## 1. Was ihr vorher installieren müsst

- **Node.js** (Version 20 oder neuer) – lädt euch die Programmiersprachen-Umgebung, mit der
  die App läuft. Download: https://nodejs.org/ (die Version mit "LTS" empfohlen).
  Prüfen, ob die Installation geklappt hat: Terminal öffnen und eingeben:
  ```bash
  node -v
  npm -v
  ```
  Es sollten Versionsnummern erscheinen (z. B. `v20.x.x`).

- **Docker Desktop** – nur nötig, wenn ihr einen eigenen Nominatim-Server (Adresssuche)
  betreiben wollt (Schritt 8, optional). Für den normalen Betrieb ist Docker **nicht** nötig.
  Download: https://www.docker.com/products/docker-desktop/

## 2. API-Key besorgen (Pflicht)

Die App nutzt **openrouteservice (ORS)** für die Routenberechnung – dafür ist immer ein
API-Key nötig, es gibt (anders als früher mit OSRM) keinen anonymen Demo-Server mehr:

1. Geht auf https://openrouteservice.org/dev/#/signup und legt einen kostenlosen Account an.
2. Der kostenlose Standard-Plan reicht für den normalen Betrieb (2000 Anfragen/Tag).
3. Erzeugt einen API-Key und kopiert ihn.

> **Für die Klartext-Anfahrtsbeschreibung** braucht ihr standardmäßig **keinen** weiteren
> Key – die App formuliert den Text ohne KI (siehe [Schritt 6](#6-klartext-erzeugung-regelbasiert-oder-ki)).
> Nur wenn ihr die optionale KI-Variante nutzen wollt, kommt dort noch ein
> Anthropic-API-Key dazu.

## 3. Projekt einrichten

Terminal öffnen, in den Projektordner wechseln und Abhängigkeiten installieren:

```bash
cd ~/feuerwehr-einsatzkarten-generator
npm install
```

Das dauert beim ersten Mal ein paar Minuten (es wird u. a. ein kompletter Chromium-Browser
für den PDF-Export mitinstalliert, ca. 200–300 MB).

Danach die Beispiel-Umgebungsdatei kopieren und ausfüllen:

```bash
cp .env.example .env
```

Öffnet die neue Datei `.env` in einem Texteditor und tragt mindestens euren
`ORS_API_KEY` aus Schritt 2 ein. Der Rest kann für den ersten Test unverändert bleiben
(Standardeinstellung ist die kostenlose, regelbasierte Klartext-Erzeugung ohne KI-Key –
siehe Schritt 6).

## 4. App starten

```bash
npm run dev
```

Danach im Browser öffnen: **http://localhost:3000**

Zum Beenden im Terminal `Strg+C` drücken.

> Für den "echten" Betrieb (nicht nur zum Testen) könnt ihr die App auch als optimierten
> Produktions-Build starten:
> ```bash
> npm run build
> npm run start
> ```

## 5. Bedienung

1. **Startpunkt** wählen: entweder eine eurer hinterlegten Feuerwachen aus der Liste, oder
   über "andere Adresse eingeben…" eine beliebige Adresse.
2. **Zielstraße** eingeben (am besten mit Ort, z. B. "Marienplatz, München", damit die
   Adresssuche eindeutig ist).
3. Auf **Start** klicken. Die App ermittelt jetzt automatisch die Route, formuliert die
   Anfahrtsbeschreibung, ermittelt den Stadtteil und erzeugt den Kartenausschnitt – das
   dauert je nach Server-Antwortzeiten ein paar Sekunden, eine Ladeanzeige zeigt euch, dass
   gearbeitet wird.
4. Ist die Zielstraße oder Startadresse **mehrdeutig** (z. B. gibt es "Bahnhofstraße" mehrfach
   in der Region), zeigt euch die App eine Auswahlliste der Treffer an – einfach den
   richtigen anklicken.
5. Nach der Verarbeitung erscheinen die Felder **Feuerwache**, **Stadtteil** und
   **Anfahrtsbeschreibung** – automatisch befüllt, aber frei editierbar. Passt sie bei Bedarf
   an.
6. Rechts seht ihr währenddessen jederzeit die **Live-Vorschau** der fertigen Karte
   (Vorderseite/Rückseite).
7. Mit **PDF exportieren** wird die Karte als druckfertige, zweiseitige A5-PDF-Datei
   heruntergeladen und gleichzeitig lokal gespeichert (siehe "Gespeicherte Karten" unten in
   der linken Spalte – dort könnt ihr eine frühere Karte später wieder öffnen, um sie zu
   korrigieren und erneut zu exportieren, ohne alles neu zu berechnen).

## 6. Klartext-Erzeugung: regelbasiert oder KI

Wie die Anfahrtsbeschreibung ("re. Nordendstr. – li. Barerstr. – …") aus der Route formuliert
wird, stellt ihr in der `.env`-Datei über `DESCRIPTION_MODE` ein:

- **`deterministic` (empfohlen, Standard im Live-Betrieb):** regelbasiert, ohne KI-Aufruf –
  **kostenlos** und ohne Halluzinations-Risiko (siehe `src/lib/deterministicDescription.ts`).
  Ein paar Feinheiten fehlen (z. B. benannte Kreuzungen wie "am Isartorplatz"), das ist im
  Code kommentiert.
- **`ai`:** lässt die Route von einer KI in Text formulieren (bestes Sprachgefühl, kostet aber
  etwas pro Karte). Primär wird ein lokaler **Ollama**-Server genutzt (`OLLAMA_*`-Variablen);
  schlägt der fehl oder ist `OLLAMA_ENABLED=false`, weicht die App auf **Anthropic Claude**
  aus – dafür ist dann zusätzlich ein `ANTHROPIC_API_KEY` nötig (Account unter
  https://console.anthropic.com/, "API Keys" → "Create Key", Zahlungsmethode hinterlegen).

Alle Details und Beispieltexte, an denen sich die KI-Variante orientiert, stehen in
[`src/config/routeDescriptionExamples.ts`](src/config/routeDescriptionExamples.ts).

## 7. Wachen, Ausfahrtsrichtungen und Abkürzungen verwalten

Eure Feuerwachen, deren Ausfahrtsrichtungen (für Fälle, in denen die direkte Verbindung
routing-technisch nicht auffindbar ist) und wachenübergreifende bekannte Abkürzungen liegen
in der Datenbank und werden **über die Weboberfläche gepflegt** – nicht mehr im Code:

**http://localhost:3000/verwaltung** (Link auch oben rechts im Generator)

Beim allerersten Start wird die Datenbank automatisch mit Beispieldaten befüllt (siehe
`seedStationsIfEmpty()` in `src/lib/db.ts`). Passt dort eure echten Wachen an (Kürzel, Name,
Adresse, Koordinaten – per Kartenklick auswählbar) und löscht/ersetzt die Beispieldaten.

## 8. Eigenen Nominatim-Server einrichten (optional)

Standardmäßig nutzt die App für die Adresssuche/den Stadtteil den **öffentlichen Demo-Server**
von Nominatim. Der ist laut Nutzungsbedingungen nur für **geringes Volumen/Tests** gedacht
(max. 1 Anfrage/Sekunde) – für Dauerbetrieb solltet ihr einen eigenen Server per Docker
betreiben.

⚠️ **Das braucht Zeit und Speicherplatz!** Je nach Kartenausschnitt (Stadt/Landkreis vs. ganz
Bayern vs. ganz Deutschland) kann der einmalige Datenimport von wenigen Minuten bis zu
mehreren Stunden dauern und mehrere GB bis >50 GB Speicherplatz benötigen. Für den Anfang
empfehlen wir einen möglichst kleinen Ausschnitt (euer Landkreis/Regierungsbezirk).

### 8.1 Docker starten

Docker Desktop öffnen und warten, bis es läuft (Symbol in der Menüleiste wird grün/aktiv).

### 8.2 Kartendaten bereitstellen

Ladet euch eine `.osm.pbf`-Datei eures gewünschten Ausschnitts (Übersicht unter
https://download.geofabrik.de/) und legt sie hier ab:

```bash
cp region.osm.pbf docker/nominatim-data/data.osm.pbf
```

### 8.3 Container starten

```bash
docker compose up -d
```

Der erste Start importiert jetzt die Daten in eine Datenbank – das dauert (siehe Warnung
oben). Fortschritt könnt ihr mitverfolgen mit:

```bash
docker compose logs -f nominatim
```

Sobald der Import fertig ist, läuft Nominatim unter `http://localhost:8080`.

### 8.4 App auf den eigenen Server umstellen

In der `.env`-Datei die folgende Zeile anpassen:

```
NOMINATIM_URL=http://localhost:8080
```

App neu starten (`npm run dev` bzw. `npm run start` neu ausführen), fertig.

## 9. Wo landen die Daten?

- Jede exportierte Karte wird in einer lokalen Datenbank-Datei unter `data/app.db`
  gespeichert (Startpunkt, Zielstraße, Feuerwache, Stadtteil, Anfahrtsbeschreibung, Pfad zum
  Kartenbild, Erstellungsdatum). Dieselbe Datei enthält auch die unter Schritt 7 gepflegten
  Wachen/Abkürzungen. Diese Datei braucht ihr nicht anzufassen – sie wird automatisch angelegt
  und verwaltet.
- Die erzeugten Kartenausschnitte (PNG-Bilder) liegen unter `public/generated/`.
- Über die Liste "Gespeicherte Karten" in der App könnt ihr eine frühere Karte wieder laden,
  Felder korrigieren und erneut als PDF exportieren, ohne Route/Text/Kartenbild neu berechnen
  zu müssen.

**Datensicherung:** Wenn ihr die App auf einen anderen Rechner umzieht oder sichert, nehmt
einfach den gesamten Ordner `data/` (und optional `public/generated/`) mit.

## 10. Häufige Probleme

- **"ORS_API_KEY fehlt"**: Ihr habt die `.env`-Datei nicht angelegt oder den Key nicht
  eingetragen – siehe Schritt 2/3.
- **"Es konnte keine Route gefunden werden"**: Start- oder Zielpunkt liegen evtl. weit
  außerhalb des sinnvollen Einsatzgebiets, oder es existiert tatsächlich keine befahrbare
  Straßenverbindung.
- **"Zielstraße wurde nicht gefunden"**: Versucht die Eingabe eindeutiger zu machen
  (z. B. Ort/Postleitzahl ergänzen).
- **Sehr langsame erste Anfrage / Timeout beim Kartenbild**: Der allererste Aufruf startet
  einen Chromium-Hintergrundprozess (für Kartenbild + PDF), das kann ein paar Sekunden extra
  dauern. Bei dauerhaft langsamen Antworten: prüft eure Internetverbindung bzw. die
  Erreichbarkeit von ORS/Nominatim.
- **`npm install` bricht mit einem Fehler zu "better-sqlite3" ab**: Dieses Paket enthält
  nativen Code, der bei manchen Systemen kompiliert werden muss. Stellt sicher, dass die
  Xcode-Kommandozeilentools installiert sind (`xcode-select --install`) und versucht
  `npm install` erneut.
- **Docker-Container "nominatim" startet nicht / bricht beim Import ab**: Prüft, ob die
  `.osm.pbf`-Datei tatsächlich unter `docker/nominatim-data/data.osm.pbf` liegt (Schritt 8.2)
  und ob genug Speicherplatz frei ist.

## 11. App online stellen (eigene Domain)

Bisher lief die App nur lokal auf eurem Rechner (`npm run dev`). Wollt ihr sie unter einer
eigenen Adresse im Internet erreichbar machen (z. B. für alle Feuerwachen gemeinsam nutzbar,
mit eigener Domain), gibt es zwei Wege – beide separat dokumentiert:

- [DEPLOY.md](DEPLOY.md) – Hosting in der Cloud (Railway), keine eigene Hardware nötig, dafür
  laufende Kosten.
- [DEPLOY_NUC.md](DEPLOY_NUC.md) – Selbst-Hosting auf eigener Hardware zuhause (z. B. einem
  NUC), keine laufenden Hosting-Kosten, dafür mehr Einrichtungsaufwand (Portfreigabe, Dynamic
  DNS) und ihr seid selbst für den Dauerbetrieb verantwortlich.

---

## Technischer Überblick (für spätere Erweiterungen)

- **Next.js (App Router) + TypeScript + Tailwind CSS** als Full-Stack-Framework
- Backend-Logik liegt in `src/lib/` als eigenständige, wiederverwendbare Funktionen
  (Routing, Geocoding, Klartext-Erzeugung, Kartenbild, PDF) – **nicht** fest an die UI
  gekoppelt. Das macht einen späteren Ausbau zu Batch-Verarbeitung (CSV-Import vieler Straßen)
  einfach: ihr müsstet nur eine neue API-Route bauen, die dieselben `src/lib/*`-Funktionen in
  einer Schleife aufruft.
- `src/app/api/*` enthält die Next.js API-Routes, die diese Funktionen verdrahten.
- `src/components/*` enthält die UI-Komponenten (Eingabemaske, Live-Vorschau,
  Koordinatenauswahl).
- **Routing**: openrouteservice (ORS, `driving-car`-Profil) + nachträgliche Höhenprüfung
  echter Engstellen über die Overpass API (`src/lib/routing.ts`).
- **Klartext-Erzeugung**: standardmäßig regelbasiert (`src/lib/deterministicDescription.ts`),
  optional KI-gestützt über Ollama mit Anthropic-Rückfallebene (`src/lib/claude.ts`) – siehe
  Schritt 6.
- **Wachen/Ausfahrtsrichtungen/Abkürzungen**: liegen in der SQLite-Datenbank, verwaltbar unter
  `/verwaltung` (`src/app/verwaltung/page.tsx`).
- SQLite-Datenbank über `better-sqlite3` (`src/lib/db.ts`), keine externe Datenbank nötig.
- Kartenausschnitt: MapLibre + Vector-Tiles, per Headless-Chromium (Puppeteer) als PNG
  fotografiert (`src/lib/mapImage.ts`).
- PDF-Export: dasselbe Headless-Chromium rendert ein eigenständiges HTML/CSS-Template im
  exakten A5-Format zu PDF (`src/lib/pdf.ts`).
