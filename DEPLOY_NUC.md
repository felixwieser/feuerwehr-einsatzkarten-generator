# Deployment auf eigener Hardware (NUC zuhause)

Diese Anleitung bringt die App auf eurem eigenen NUC zuhause online, erreichbar unter einer
eigenen Domain (z. B. `einsatzkarten.eure-domain.de`) mit automatischem HTTPS. Alternative zu
[DEPLOY.md](DEPLOY.md) (Railway/Cloud) – kostet keine laufende Hosting-Gebühr, dafür etwas mehr
Einrichtungsaufwand und ihr seid selbst für den Dauerbetrieb (Strom, Internetverbindung,
Updates) verantwortlich.

**Voraussetzung:** Der NUC läuft mit einem normalen Linux (Ubuntu/Debian o. ä.), ihr habt
SSH-Zugriff darauf.

**Kurzüberblick, was am Ende passiert:** Der NUC hostet zwei Docker-Container – die App selbst
und einen Reverse-Proxy (Caddy), der automatisch ein kostenloses HTTPS-Zertifikat besorgt und
Anfragen an die App weiterreicht. Damit die Außenwelt den NUC überhaupt findet, leitet ihr
Port 80+443 im Router auf ihn weiter und richtet Dynamic DNS ein (da eure Heim-IP sich
vermutlich gelegentlich ändert).

---

## Inhaltsverzeichnis

1. [NUC vorbereiten](#1-nuc-vorbereiten)
2. [Projekt auf den NUC übertragen](#2-projekt-auf-den-nuc-übertragen)
3. [.env auf dem NUC einrichten](#3-env-auf-dem-nuc-einrichten)
4. [Dynamic DNS einrichten (No-IP)](#4-dynamic-dns-einrichten-no-ip)
5. [GoDaddy: eure Domain auf No-IP zeigen lassen](#5-godaddy-eure-domain-auf-no-ip-zeigen-lassen)
6. [Router: Ports freigeben](#6-router-ports-freigeben)
7. [App starten](#7-app-starten)
8. [Testen](#8-testen)
9. [Updates ausrollen](#9-updates-ausrollen)
10. [Backup](#10-backup)
11. [Häufige Probleme](#11-häufige-probleme)
12. [Sicherheitshinweise](#12-sicherheitshinweise)

---

## 1. NUC vorbereiten

Lokale IP-Adresse des NUC herausfinden (direkt am NUC, oder per SSH falls schon bekannt):

```bash
hostname -I
```

**Wichtig:** Vergebt dem NUC im Router eine **feste lokale IP** (DHCP-Reservierung anhand seiner
MAC-Adresse) – sonst funktioniert die Portweiterleitung aus Schritt 6 irgendwann nicht mehr,
wenn der Router ihm eine andere IP zuteilt. Wie das geht, hängt vom Routermodell ab (meist unter
"DHCP" / "Netzwerk" / "Geräte" in der Router-Weboberfläche).

Prüfen, ob Docker + Docker Compose bereits installiert sind:

```bash
docker --version
docker compose version
```

Falls nicht installiert:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Danach einmal aus- und wieder einloggen (SSH neu verbinden), damit die Gruppenmitgliedschaft
greift.

## 2. Projekt auf den NUC übertragen

Von eurem Mac aus, im Projektordner (ersetzt `nuc-user` und `nuc-ip` durch euren
SSH-Benutzernamen und die lokale IP des NUC aus Schritt 1):

```bash
rsync -avz --exclude node_modules --exclude .next --exclude .git --exclude data \
  --exclude 'public/generated' --exclude 'public/maplibre' \
  ./ nuc-user@nuc-ip:~/einsatzkarten-generator/
```

## 3. .env auf dem NUC einrichten

Eure lokale `.env` enthält bereits den echten Anthropic-Key etc. – direkt mit übertragen (auf
demselben Heimnetz unbedenklich):

```bash
scp .env nuc-user@nuc-ip:~/einsatzkarten-generator/.env
```

Danach auf dem NUC per SSH die Datei um die Domain ergänzen:

```bash
ssh nuc-user@nuc-ip
cd ~/einsatzkarten-generator
echo "DOMAIN=einsatzkarten.eure-domain.de" >> .env
```

(ersetzt `einsatzkarten.eure-domain.de` durch die Adresse, die ihr in Schritt 5 tatsächlich
einrichtet – z. B. mit eurer echten GoDaddy-Domain statt `eure-domain.de`).

## 4. Dynamic DNS einrichten (No-IP)

Eure Heim-Internetverbindung hat fast sicher **keine feste IP-Adresse** – der Provider vergibt
euch von Zeit zu Zeit eine neue. Da ihr bereits einen No-IP-Account habt, nutzen wir den: er
gibt euch eine Adresse wie `euer-name.ddns.net`, die automatisch aktuell gehalten werden muss,
sobald sich eure IP ändert. Eure eigentliche Domain bei GoDaddy zeigt dann per CNAME einfach auf
diese No-IP-Adresse (Schritt 5).

**Zuerst prüfen, ob das bei euch schon automatisch passiert** (z. B. weil euer Router No-IP
schon eingebaut unterstützt – viele tun das unter "DDNS" in den Router-Einstellungen). Von
eurem Mac aus:

```bash
dig +short EUER-NAME.ddns.net
curl -s https://api.ipify.org
```

(`EUER-NAME.ddns.net` durch eure echte No-IP-Adresse ersetzen – die genaue Endung kann auch
anders lauten, z. B. `.hopto.org`, je nachdem was ihr bei No-IP gewählt habt.)

**Zeigen beide Befehle dieselbe IP-Adresse an → ihr seid fertig**, Schritt 4 ist bereits erledigt,
weiter mit Schritt 5.

**Zeigen sie unterschiedliche Adressen (oder gar keine) →** dann richtet ihr auf dem NUC einen
Update-Cronjob ein, der eure IP regelmäßig an No-IP meldet:

```bash
mkdir -p ~/noip
cat > ~/noip/update.sh << 'EOF'
curl -s "https://EUER-BENUTZERNAME:EUER-PASSWORT@dynupdate.no-ip.com/nic/update?hostname=EUER-NAME.ddns.net" -o ~/noip/update.log
EOF
chmod +x ~/noip/update.sh
(crontab -l 2>/dev/null; echo "*/30 * * * * ~/noip/update.sh >/dev/null 2>&1") | crontab -
~/noip/update.sh
cat ~/noip/update.log
```

`EUER-BENUTZERNAME`, `EUER-PASSWORT` und `EUER-NAME.ddns.net` durch eure echten No-IP-Zugangsdaten
ersetzen. Im Log sollte `good <eure-ip>` oder `nochg <eure-ip>` stehen (beides bedeutet Erfolg).

**Hinweis zu kostenlosen No-IP-Hostnamen:** die müssen alle 30 Tage per E-Mail-Link bestätigt
werden, sonst laufen sie ab – achtet auf diese Mails von No-IP.

## 5. GoDaddy: eure Domain auf No-IP zeigen lassen

1. Bei GoDaddy einloggen → "Meine Produkte" → bei eurer Domain auf "DNS verwalten".
2. "Neuer Eintrag":
   - Typ: `CNAME`
   - Name/Host: `einsatzkarten` (der Teil, den ihr als Subdomain wollt)
   - Wert/Ziel: `euer-name.ddns.net` (eure No-IP-Adresse aus Schritt 4, **mit** Punkt am Ende,
     falls GoDaddy das verlangt: `euer-name.ddns.net.`)
   - TTL: Standard belassen
3. Speichern. Die Domain in eurer `.env` (Schritt 3) muss exakt diesem Namen entsprechen, also
   `einsatzkarten.eure-domain.de`.

DNS-Änderungen brauchen etwas Zeit (meist Minuten). Prüfen könnt ihr es später mit:

```bash
dig +short einsatzkarten.eure-domain.de
```

Das sollte am Ende eure aktuelle öffentliche Heim-IP zeigen.

## 6. Router: Ports freigeben

In der Weboberfläche eures Routers (meist `192.168.0.1` oder `192.168.1.1` im Browser, Zugangsdaten
stehen oft auf der Rückseite des Routers) nach "Portweiterleitung" / "Port Forwarding" /
"NAT" suchen und zwei Regeln anlegen, beide auf die **feste lokale IP des NUC** (Schritt 1):

| Extern (Internet) | Intern (NUC) | Protokoll |
|---|---|---|
| 80  | 80  | TCP |
| 443 | 443 | TCP |

## 7. App starten

Per SSH auf dem NUC, im Projektordner:

```bash
cd ~/einsatzkarten-generator
docker compose -f docker-compose.prod.yml up -d --build
```

Der erste Build dauert einige Minuten (Chromium-Download etc.). Danach prüfen, ob beide
Container laufen:

```bash
docker compose -f docker-compose.prod.yml ps
```

Logs bei Bedarf:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

## 8. Testen

Im Browser: `https://einsatzkarten.eure-domain.de` (eure echte Domain aus Schritt 5) öffnen.
Caddy braucht beim allerersten Aufruf ein paar Sekunden, um automatisch das HTTPS-Zertifikat zu
besorgen – falls es zunächst eine Zertifikatswarnung/Fehlerseite gibt, kurz warten und neu laden.

## 9. Updates ausrollen

Nach künftigen Code-Änderungen (z. B. wenn ich euch weitere Anpassungen mache): Schritt 2
(rsync) wiederholen, danach auf dem NUC:

```bash
cd ~/einsatzkarten-generator
docker compose -f docker-compose.prod.yml up -d --build
```

## 10. Backup

Alle wichtigen Daten (Datenbank + generierte Kartenbilder) liegen im Docker-Volume
`app-persist`. Sichern z. B. so (auf dem NUC):

```bash
docker run --rm -v einsatzkarten-generator_app-persist:/data -v ~/backups:/backup \
  alpine tar czf /backup/einsatzkarten-backup-$(date +%Y%m%d).tar.gz -C /data .
```

(Volume-Name kann je nach Projektordner-Name leicht abweichen – mit `docker volume ls` prüfen.)

## 11. Häufige Probleme

- **Zertifikat wird nicht ausgestellt / Caddy-Log zeigt Fehler**: Meist liegt es daran, dass die
  Domain noch nicht korrekt auf eure IP zeigt (Schritt 4/5 prüfen, `dig` s. o.) oder Port 80/443
  noch nicht richtig weitergeleitet sind (Schritt 6). Let's Encrypt braucht Port 80 **und** 443
  von außen erreichbar für die Zertifikatsprüfung.
- **"Application failed to respond" / Seite lädt nicht**: `docker compose -f
  docker-compose.prod.yml logs app` prüfen.
- **Nach NUC-Neustart ist die App weg**: Docker muss beim Systemstart automatisch starten
  (Standard bei den meisten Distributionen, prüfen mit `systemctl is-enabled docker` – falls
  nicht `enabled`: `sudo systemctl enable docker`). Die Container selbst starten dank
  `restart: unless-stopped` automatisch mit.
- **Eure sichtbare IP hat sich geändert und die Seite ist nicht mehr erreichbar**: Falls euer
  Router No-IP automatisch aktualisiert, dessen DDNS-Status in der Router-Oberfläche prüfen.
  Falls ihr den Cronjob aus Schritt 4 nutzt: prüft `~/noip/update.log` auf dem NUC, ob dort
  `good`/`nochg` steht (nicht z. B. `badauth` – dann stimmen Benutzername/Passwort nicht).

## 12. Sicherheitshinweise

Ihr macht euren NUC damit direkt aus dem Internet erreichbar (Ports 80/443). Ein paar
Grundregeln:

- Nur 80/443 weiterleiten – sonst nichts (insbesondere KEIN SSH-Port 22 nach außen öffnen; für
  Fernzugriff per SSH stattdessen ein VPN zu eurem Heimnetz nutzen, z. B. WireGuard/Tailscale).
- NUC-Betriebssystem regelmäßig aktualisieren (`sudo apt update && sudo apt upgrade`).
- Die App selbst ist bewusst NICHT direkt vom Host aus erreichbar (kein Port-Mapping im
  Compose-File, siehe Kommentar dort) – nur Caddy ist von außen ansprechbar und reicht Anfragen
  intern weiter.
