# Feuerwehr-Einsatzkarten-Generator

Diese App erstellt automatisch **Anfahrtskarten im Format DIN A5** für Feuerwehreinsätze:
Ihr gebt eine Zielstraße ein, die App ermittelt die kürzeste Anfahrt von eurer Feuerwache,
übersetzt die Route in eine kurze Anfahrtsbeschreibung ("re. Nordendstr. – li. Barerstr. – …"),
ermittelt den Stadtteil und erzeugt eine druckfertige, zweiseitige PDF-Karte
(Vorderseite = Text, Rückseite = Kartenausschnitt mit Zielmarkierung).

Diese Anleitung ist für Nicht-Programmierer geschrieben – folgt einfach den Schritten von oben
nach unten.

> **Hinweis zu diesem Projekt:** Der Code wurde vollständig erstellt, konnte aber in der
> Umgebung, in der er entstanden ist, nicht selbst installiert/getestet werden (dort waren
> weder Node.js noch Docker verfügbar). Führt daher bitte alle Schritte unten sorgfältig aus
> und meldet euch, falls beim ersten Start Fehler auftreten – die lassen sich in der Regel
> schnell beheben.

---

## Inhaltsverzeichnis

1. [Was ihr vorher installieren müsst](#1-was-ihr-vorher-installieren-müsst)
2. [Anthropic-API-Key besorgen (Pflicht)](#2-anthropic-api-key-besorgen-pflicht)
3. [Projekt einrichten](#3-projekt-einrichten)
4. [Schnellstart (ohne eigene Server, mit Demo-Servern)](#4-schnellstart-ohne-eigene-server-mit-demo-servern)
5. [App starten](#5-app-starten)
6. [Bedienung](#6-bedienung)
7. [Eigene Routing-/Geocoding-Server einrichten (optional, aber empfohlen)](#7-eigene-routing--geocoding-server-einrichten-optional-aber-empfohlen)
8. [Eure Feuerwachen eintragen](#8-eure-feuerwachen-eintragen)
9. [Beispieltexte für die KI anpassen](#9-beispieltexte-für-die-ki-anpassen)
10. [Wo landen die Daten?](#10-wo-landen-die-daten)
11. [Häufige Probleme](#11-häufige-probleme)
12. [App online stellen (eigene Domain)](#12-app-online-stellen-eigene-domain)

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

- **Docker Desktop** – nur nötig, wenn ihr eigene Routing-/Geocoding-Server betreiben wollt
  (Schritt 7, empfohlen für den späteren Dauerbetrieb). Für den ersten Test (Schritt 4) ist
  Docker **nicht** nötig. Download: https://www.docker.com/products/docker-desktop/

## 2. Anthropic-API-Key besorgen (Pflicht)

Die App nutzt Claude (von Anthropic), um aus den rohen Routendaten die kurze
Anfahrtsbeschreibung zu formulieren. Dafür braucht ihr einen API-Key:

1. Geht auf https://console.anthropic.com/ und legt einen Account an (falls noch nicht
   vorhanden).
2. Hinterlegt dort unter "Billing" eine Zahlungsmethode und ladet etwas Guthaben auf
   (die Kosten pro erstellter Karte sind sehr gering, siehe dortige Preisliste).
3. Geht zu "API Keys" → "Create Key" und kopiert den erzeugten Schlüssel
   (beginnt mit `sk-ant-...`). **Diesen Schlüssel bekommt niemand außer euch zu sehen –
   er landet nur in eurer lokalen `.env`-Datei, nie im Programmcode.**

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
`ANTHROPIC_API_KEY` aus Schritt 2 ein. Der Rest kann für den ersten Test unverändert bleiben.

## 4. Schnellstart (ohne eigene Server, mit Demo-Servern)

Standardmäßig ist die App so eingestellt, dass sie die **öffentlichen Demo-Server** von OSRM
(Routing) und Nominatim (Adresssuche) nutzt. Damit könnt ihr sofort loslegen, ohne Docker
einzurichten. Diese Demo-Server sind aber laut deren Nutzungsbedingungen nur für **geringes
Volumen/Tests** gedacht – für den echten Dauerbetrieb solltet ihr Schritt 7 (eigene Server)
durchführen.

Weiter mit [Schritt 5 – App starten](#5-app-starten).

## 5. App starten

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

## 6. Bedienung

1. **Startpunkt** wählen: entweder eine eurer hinterlegten Feuerwachen aus der Liste, oder
   über "andere Adresse eingeben…" eine beliebige Adresse.
2. **Zielstraße** eingeben (am besten mit Ort, z. B. "Marienplatz, München", damit die
   Adresssuche eindeutig ist).
3. Auf **Start** klicken. Die App ermittelt jetzt automatisch die Route, lässt die
   Anfahrtsbeschreibung von der KI formulieren, ermittelt den Stadtteil und erzeugt den
   Kartenausschnitt – das dauert je nach Server-Antwortzeiten ein paar Sekunden, eine
   Ladeanzeige zeigt euch, dass gearbeitet wird.
4. Ist die Zielstraße oder Startadresse **mehrdeutig** (z. B. gibt es "Bahnhofstraße" mehrfach
   in der Region), zeigt euch die App eine Auswahlliste der Treffer an – einfach den
   richtigen anklicken.
5. Nach der Verarbeitung erscheinen die Felder **Feuerwache**, **Stadtteil** und
   **Anfahrtsbeschreibung** – automatisch befüllt, aber frei editierbar. Passt sie bei Bedarf
   an (z. B. wenn die KI-Formulierung noch verbessert werden soll).
6. Rechts seht ihr währenddessen jederzeit die **Live-Vorschau** der fertigen Karte
   (Vorderseite/Rückseite).
7. Mit **PDF exportieren** wird die Karte als druckfertige, zweiseitige A5-PDF-Datei
   heruntergeladen und gleichzeitig lokal gespeichert (siehe "Gespeicherte Karten" unten in
   der linken Spalte – dort könnt ihr eine frühere Karte später wieder öffnen, um sie zu
   korrigieren und erneut zu exportieren, ohne alles neu zu berechnen).

## 7. Eigene Routing-/Geocoding-Server einrichten (optional, aber empfohlen)

Für Dauerbetrieb (viele Karten, häufige Nutzung) solltet ihr **eigene** OSRM- und
Nominatim-Server per Docker betreiben, statt die öffentlichen Demo-Server zu belasten.

⚠️ **Das braucht Zeit und Speicherplatz!** Je nach Kartenausschnitt (Stadt/Landkreis vs.
ganz Bayern vs. ganz Deutschland) kann der einmalige Datenimport von wenigen Minuten bis zu
mehreren Stunden dauern und mehrere GB bis >50 GB Speicherplatz benötigen. Für den Anfang
empfehlen wir einen möglichst kleinen Ausschnitt (euer Landkreis/Regierungsbezirk).

### 7.1 Docker starten

Docker Desktop öffnen und warten, bis es läuft (Symbol in der Menüleiste wird grün/aktiv).

### 7.2 OSRM-Kartendaten vorbereiten

```bash
./scripts/setup-osrm-data.sh https://download.geofabrik.de/europe/germany/bayern/oberbayern-latest.osm.pbf
```

(Ersetzt die URL bei Bedarf durch euren gewünschten Kartenausschnitt – eine Übersicht aller
verfügbaren Regionen findet ihr unter https://download.geofabrik.de/.)

Das Skript lädt die Kartendaten herunter und bereitet sie für OSRM auf. Das dauert je nach
Region und Rechnerleistung einige Minuten bis Stunden.

### 7.3 Nominatim-Kartendaten bereitstellen

Legt dieselbe `.osm.pbf`-Datei (oder eine gröbere/feinere, je nach Bedarf) zusätzlich hier ab:

```bash
cp docker/osrm-data/region.osm.pbf docker/nominatim-data/data.osm.pbf
```

### 7.4 Container starten

```bash
docker compose up -d
```

Der erste Start von Nominatim importiert jetzt die Daten in eine Datenbank – das dauert
(siehe Warnung oben). Fortschritt könnt ihr mitverfolgen mit:

```bash
docker compose logs -f nominatim
```

Sobald der Import fertig ist, läuft:
- OSRM unter `http://localhost:5000`
- Nominatim unter `http://localhost:8080`

### 7.5 App auf eigene Server umstellen

In der `.env`-Datei die folgenden Zeilen anpassen:

```
OSRM_URL=http://localhost:5000
NOMINATIM_URL=http://localhost:8080
```

App neu starten (`npm run dev` bzw. `npm run start` neu ausführen), fertig.

## 8. Eure Feuerwachen eintragen

Öffnet die Datei [`src/config/stations.ts`](src/config/stations.ts) in einem Texteditor.
Dort sind aktuell nur zwei **Beispiel-Feuerwachen** (Münchner Beispieladressen) hinterlegt.
Ersetzt diese durch eure echten Wachen: Kürzel, Name, Adresse sowie die Koordinaten
(lat/lon). Koordinaten könnt ihr z. B. über
https://nominatim.openstreetmap.org/ui/search.html ermitteln (Adresse eingeben, Treffer
anklicken, Koordinaten stehen in den Details) oder über Google Maps
(Rechtsklick auf den Punkt → angezeigte Koordinaten kopieren).

Änderungen an dieser Datei werden erst nach einem Neustart der App (`npm run dev` neu
ausführen) wirksam.

## 9. Beispieltexte für die KI anpassen

Die KI lernt den gewünschten Schreibstil über zwei Beispiel-Texte in
[`src/config/routeDescriptionExamples.ts`](src/config/routeDescriptionExamples.ts).

**Wichtiger Hinweis:** Im ursprünglichen Auftrag für dieses Projekt war von zwei
Referenzbeispielen die Rede ("Heßstraße → Lazarettstraße" und ein Foto einer echten Karte
"Braunauer Eisenbahnbrücke"). Nur der Text für Braunauer Eisenbahnbrücke lag tatsächlich
vollständig vor und wurde als "Beispiel 1" übernommen. Für "Beispiel 2" wurde, da kein
vollständiger Text vorlag, ein **frei erfundener, schematischer Platzhalter** eingesetzt, der
nur zeigt, wie mehrere Abbiegungen in dieselbe Richtung kurz hintereinander notiert werden
("1. li.", "2. li.").

**Bitte ersetzt Beispiel 2 durch einen echten Text von euren eigenen Referenzkarten**, um die
KI-Ausgabe an euren tatsächlichen Stil anzupassen. Je näher die Beispiele am gewünschten
Ergebnis sind, desto konsistenter wird die Ausgabe. Die Datei ist ausführlich kommentiert und
zeigt genau, wie ein Beispiel aufgebaut ist.

## 10. Wo landen die Daten?

- Jede exportierte Karte wird in einer lokalen Datenbank-Datei unter `data/app.db`
  gespeichert (Startpunkt, Zielstraße, Feuerwache, Stadtteil, Anfahrtsbeschreibung, Pfad zum
  Kartenbild, Erstellungsdatum). Diese Datei braucht ihr nicht anzufassen – sie wird
  automatisch angelegt und verwaltet.
- Die erzeugten Kartenausschnitte (PNG-Bilder) liegen unter `public/generated/`.
- Über die Liste "Gespeicherte Karten" in der App könnt ihr eine frühere Karte wieder laden,
  Felder korrigieren und erneut als PDF exportieren, ohne Route/KI-Text/Kartenbild neu
  berechnen zu müssen.

**Datensicherung:** Wenn ihr die App auf einen anderen Rechner umzieht oder sichert, nehmt
einfach den gesamten Ordner `data/` (und optional `public/generated/`) mit.

## 11. Häufige Probleme

- **"ANTHROPIC_API_KEY fehlt"**: Ihr habt die `.env`-Datei nicht angelegt oder den Key nicht
  eingetragen – siehe Schritt 3.
- **"Es konnte keine Route gefunden werden"**: Start- oder Zielpunkt liegen evtl. außerhalb
  des von eurem OSRM-Server abgedeckten Kartenausschnitts (falls ihr einen eigenen Server
  nutzt, siehe Schritt 7), oder es existiert tatsächlich keine befahrbare Straßenverbindung.
- **"Zielstraße wurde nicht gefunden"**: Versucht die Eingabe eindeutiger zu machen
  (z. B. Ort/Postleitzahl ergänzen).
- **Sehr langsame erste Anfrage / Timeout beim Kartenbild**: Der allererste Aufruf startet
  einen Chromium-Hintergrundprozess (für Kartenbild + PDF), das kann ein paar Sekunden extra
  dauern. Bei dauerhaft langsamen Antworten: prüft eure Internetverbindung bzw. die
  Erreichbarkeit von OSRM/Nominatim.
- **`npm install` bricht mit einem Fehler zu "better-sqlite3" ab**: Dieses Paket enthält
  nativen Code, der bei manchen Systemen kompiliert werden muss. Stellt sicher, dass die
  Xcode-Kommandozeilentools installiert sind (`xcode-select --install`) und versucht
  `npm install` erneut.
- **Docker-Container "osrm" startet nicht / beendet sich sofort**: Ihr habt vermutlich Schritt
  7.2 (Kartendaten vorbereiten) noch nicht ausgeführt. Ohne aufbereitete Kartendaten unter
  `docker/osrm-data/region.osrm` kann der Server nicht starten.

## 12. App online stellen (eigene Domain)

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
  (Routing, Geocoding, KI-Text, Kartenbild, PDF) – **nicht** fest an die UI gekoppelt.
  Das macht einen späteren Ausbau zu Batch-Verarbeitung (CSV-Import vieler Straßen) einfach:
  ihr müsstet nur eine neue API-Route bauen, die dieselben `src/lib/*`-Funktionen in einer
  Schleife aufruft.
- `src/app/api/*` enthält die Next.js API-Routes, die diese Funktionen verdrahten.
- `src/components/*` enthält die UI-Komponenten (Eingabemaske, Live-Vorschau).
- SQLite-Datenbank über `better-sqlite3` (`src/lib/db.ts`), keine externe Datenbank nötig.
- Kartenausschnitt: Leaflet + OSM-Kacheln, per Headless-Chromium (Puppeteer) als PNG
  fotografiert (`src/lib/mapImage.ts`).
- PDF-Export: dasselbe Headless-Chromium rendert ein eigenständiges HTML/CSS-Template im
  exakten A5-Format zu PDF (`src/lib/pdf.ts`).
