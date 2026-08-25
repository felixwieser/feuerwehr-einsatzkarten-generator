# Deployment (App online stellen)

Diese Anleitung bringt die App unter eurer eigenen Adresse (z. B.
`einsatzkarten.eure-domain.de`) online. Auch für Nicht-Programmierer gedacht –
Schritt für Schritt von oben nach unten.

**Wichtig zum Verständnis, bevor ihr loslegt:** Domain und Hosting sind zwei
getrennte Dinge:

- **Domain/DNS** (bei euch: GoDaddy) – bestimmt, welcher Name (z. B.
  `eure-domain.de`) zu welcher Adresse im Internet zeigt. Das bleibt bei
  GoDaddy, ändert sich nicht.
- **Hosting** – der Server, auf dem die App tatsächlich läuft. Normales
  GoDaddy-"Webhosting" (Shared-/cPanel-Hosting) funktioniert dafür **nicht**,
  weil diese App ein dauerhaft laufender Node.js-Server ist, der zum
  Kartenrendern einen Headless-Browser (Puppeteer/Chromium) braucht – das
  erlaubt klassisches Webhosting nicht. Wir nutzen daher **Railway**
  (https://railway.com/) als Hosting – dort deployt ihr per Kommandozeile
  direkt aus diesem Ordner, ohne GitHub o. ä.

Am Ende zeigt ihr per DNS-Eintrag bei GoDaddy einfach auf die von Railway
bereitgestellte Adresse.

---

## Inhaltsverzeichnis

1. [Railway-Konto anlegen](#1-railway-konto-anlegen)
2. [Railway-CLI installieren](#2-railway-cli-installieren)
3. [Projekt deployen](#3-projekt-deployen)
4. [Persistentes Volume einrichten](#4-persistentes-volume-einrichten)
5. [Umgebungsvariablen setzen](#5-umgebungsvariablen-setzen)
6. [App erreichbar machen (Domain)](#6-app-erreichbar-machen-domain)
7. [Eigene Domain über GoDaddy verbinden](#7-eigene-domain-über-godaddy-verbinden)
8. [Updates ausrollen](#8-updates-ausrollen)
9. [Kosten](#9-kosten)
10. [Häufige Probleme](#10-häufige-probleme)

---

## 1. Railway-Konto anlegen

Geht auf https://railway.com/ und registriert euch (z. B. mit eurer
Google-/GitHub-E-Mail). Ein Zahlungsmittel müsst ihr für den Start meist noch
nicht hinterlegen (Railway gibt neuen Konten etwas Startguthaben) – spätestens
nach dessen Verbrauch aber schon, siehe [Kosten](#9-kosten).

## 2. Railway-CLI installieren

Im Terminal, im Projektordner:

```bash
npm install -g @railway/cli
```

Danach einloggen (öffnet einen Browser-Tab zur Bestätigung):

```bash
railway login
```

## 3. Projekt deployen

Im Projektordner (wo auch die `Dockerfile` liegt):

```bash
railway init
```

Fragt nach einem Projektnamen – frei wählbar (z. B. `einsatzkarten-generator`).
Danach den ersten Deploy anstoßen:

```bash
railway up
```

Railway erkennt automatisch die `Dockerfile` und baut das Image. Das dauert
beim ersten Mal einige Minuten (Chromium-Download etc.) – der Fortschritt
wird im Terminal angezeigt. Falls dabei ein Fehler auftommt, den ihr nicht
selbst lösen könnt: den Fehlertext hierher kopieren, dann schauen wir uns das
gemeinsam an.

## 4. Persistentes Volume einrichten

Ohne Volume gehen eure gespeicherten Karten und generierten Kartenbilder bei
jedem Neustart/Update verloren. Im Railway-Dashboard (https://railway.com/,
euer Projekt öffnen):

1. Auf den Service (die App) klicken → Tab **"Volumes"**.
2. **"New Volume"** → Mount-Pfad exakt eintragen: `/app/persist`
3. Speichern. Railway startet den Service danach automatisch neu.

(Das `docker-entrypoint.sh`-Skript in diesem Projekt richtet daraus beim
Start automatisch sowohl die Datenbank als auch den Ordner für generierte
Kartenbilder ein – ihr müsst dafür nichts weiter tun.)

## 5. Umgebungsvariablen setzen

Im Dashboard → euer Service → Tab **"Variables"** → **"Raw Editor"** (oder
einzeln über "New Variable"). Trägt mindestens ein:

```
ORS_API_KEY=euer-echter-key-aus-.env
DESCRIPTION_MODE=deterministic
NOMINATIM_CONTACT_EMAIL=felix.wieser94@gmail.com
NOMINATIM_COUNTRYCODES=de
MAP_ZOOM=18
MAP_IMAGE_WIDTH=1490
MAP_IMAGE_HEIGHT=1050
MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

Die Werte entsprechen eurer lokalen `.env`-Datei (die selbst NICHT hochgeladen
wird – Secrets gehören nicht ins Deployment-Paket, sondern immer direkt ins
Hosting-Dashboard). `ORS_API_KEY` ist **immer** Pflicht (Routing läuft über
openrouteservice, siehe README.md Schritt 2). `ANTHROPIC_API_KEY`/`OLLAMA_*`
braucht ihr nur, wenn ihr `DESCRIPTION_MODE=ai` statt der kostenlosen,
regelbasierten Standardeinstellung nutzen wollt (siehe README.md Schritt 6).
`NOMINATIM_URL` müsst ihr nur setzen, falls ihr einen eigenen Nominatim-Server
betreibt (siehe README.md Schritt 8) – sonst wird der öffentliche Demo-Server
verwendet (siehe [Häufige Probleme](#10-häufige-probleme) zu dessen Grenzen).

Nach dem Speichern der Variablen startet Railway den Service automatisch neu.

## 6. App erreichbar machen (Domain)

Im Dashboard → euer Service → Tab **"Settings"** → Abschnitt **"Networking"**
→ **"Generate Domain"**. Ihr bekommt sofort eine Adresse wie
`einsatzkarten-generator-production.up.railway.app` – die App ist damit schon
live erreichbar (testet sie kurz).

## 7. Eigene Domain über GoDaddy verbinden

1. Im Railway-Dashboard bei **"Networking"** → **"Custom Domain"** →
   eure gewünschte (Sub-)Domain eintragen, z. B. `einsatzkarten.eure-domain.de`
   (eine **Subdomain**, nicht die nackte Domain selbst – das ist einfacher und
   von GoDaddy problemlos per CNAME unterstützt). Railway zeigt euch danach
   einen CNAME-Zielwert an, z. B. `xyz123.up.railway.app`.
2. Bei GoDaddy einloggen → **"Meine Produkte"** → bei eurer Domain auf
   **"DNS verwalten"**.
3. **"Neuer Eintrag"**:
   - Typ: `CNAME`
   - Name/Host: `einsatzkarten` (also nur der Subdomain-Teil, ohne eure
     Hauptdomain)
   - Wert/Ziel: der von Railway angezeigte Zielwert
   - TTL: Standard belassen
4. Speichern. DNS-Änderungen brauchen etwas Zeit (meist Minuten, selten bis zu
   ein paar Stunden), bis sie weltweit "verbreitet" sind. Railway zeigt im
   Dashboard an, sobald die Domain erfolgreich verifiziert ist (grünes Häkchen)
   und stellt automatisch ein SSL-Zertifikat aus (https).

## 8. Updates ausrollen

Nach künftigen Code-Änderungen genügt im Projektordner erneut:

```bash
railway up
```

## 9. Kosten

- **Railway**: nutzungsbasiert (RAM/CPU-Zeit), für eine App wie diese mit
  moderater Nutzung typischerweise im Bereich von ca. 5–15 $/Monat. Aktuelle
  Preise: https://railway.com/pricing
- **openrouteservice**: kostenloser Standard-Plan reicht für moderate Nutzung
  (2000 Anfragen/Tag), siehe https://openrouteservice.org/plans/.
- **Anthropic (Claude-API)**: nur relevant, falls ihr `DESCRIPTION_MODE=ai`
  nutzt – dann pro erzeugter Anfahrtsbeschreibung ein sehr geringer Betrag
  (siehe eure Anthropic-Console → "Usage"). Bei der empfohlenen
  Standardeinstellung `deterministic` fallen hier keine Kosten an.
- **GoDaddy**: nur die ohnehin schon laufenden Domain-Kosten, keine
  zusätzlichen Gebühren fürs Verbinden per DNS.

## 10. Häufige Probleme

- **Adresssuche wird langsam/fehlerhaft bei vielen gleichzeitigen Nutzern**:
  Der Standard-Server für die Adresssuche (Nominatim) ist ein kostenloser,
  öffentlicher Demo-Server mit strikter Nutzungsgrenze (max. 1 Anfrage/
  Sekunde) – gedacht für Tests, nicht für Dauerbetrieb mit vielen Nutzern.
  Fürs Routing selbst (openrouteservice) gilt das nicht, dort reicht der
  kostenlose Plan i. d. R. auch für Dauerbetrieb. Für echten Dauerbetrieb der
  Adresssuche: eigenen Nominatim-Server einrichten, siehe README.md Schritt 8
  (per `docker-compose.yml`, ebenfalls in diesem Projekt enthalten) und
  `NOMINATIM_URL` in Railway entsprechend umstellen.
- **"Application failed to respond" direkt nach dem Deploy**: Meist ist der
  Server noch beim Chromium-Download/Build – im Railway-Dashboard unter
  "Deployments" den Log-Verlauf prüfen, dort steht der genaue Fehler.
- **Gespeicherte Karten/Bilder nach einem Update plötzlich weg**: Volume
  (Schritt 4) fehlt oder ist falsch gemountet (muss exakt `/app/persist`
  sein).
