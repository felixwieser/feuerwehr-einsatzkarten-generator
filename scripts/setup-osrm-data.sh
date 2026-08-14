#!/usr/bin/env bash
#
# Lädt einen OpenStreetMap-Kartenausschnitt herunter und bereitet ihn für
# OSRM auf (extract -> partition -> customize). Muss NUR EINMAL ausgeführt
# werden (bzw. erneut, wenn ihr auf einen anderen/neueren Kartenausschnitt
# wechseln wollt).
#
# Verwendung:
#   ./scripts/setup-osrm-data.sh <geofabrik-url-zur-.osm.pbf-datei>
#
# Beispiel (Oberbayern, deutlich kleiner/schneller als ganz Bayern oder
# ganz Deutschland - empfohlen für den ersten Test):
#   ./scripts/setup-osrm-data.sh https://download.geofabrik.de/europe/germany/bayern/oberbayern-latest.osm.pbf
#
# Weitere Extrakte findet ihr unter https://download.geofabrik.de/
# (je größer der Ausschnitt, desto länger dauert dieser Schritt und desto
# mehr Speicherplatz/RAM wird benötigt - für ganz Deutschland solltet ihr
# mit mehreren Stunden und >16 GB RAM rechnen. Für den Anfang reicht ein
# Regierungsbezirk / Bundesland völlig aus, wenn eure Einsätze sich auf
# eine Region beschränken).
#
# Voraussetzung: Docker ist installiert und gestartet.

set -euo pipefail

PBF_URL="${1:-}"
if [ -z "$PBF_URL" ]; then
  echo "Fehler: Bitte die URL zur .osm.pbf-Datei angeben."
  echo "Beispiel: ./scripts/setup-osrm-data.sh https://download.geofabrik.de/europe/germany/bayern/oberbayern-latest.osm.pbf"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/docker/osrm-data"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

echo "==> Lade Kartenausschnitt herunter: $PBF_URL"
curl -L -o region.osm.pbf "$PBF_URL"

echo "==> Bereite Routing-Daten auf (osrm-extract) - dies kann eine Weile dauern..."
docker run --rm -t -v "$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/region.osm.pbf

echo "==> Partitioniere Daten (osrm-partition)..."
docker run --rm -t -v "$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/region.osrm

echo "==> Optimiere Daten (osrm-customize)..."
docker run --rm -t -v "$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/region.osrm

echo "==> Fertig! Ihr könnt jetzt 'docker compose up -d osrm' starten."
echo "    Der OSRM-Server ist danach unter http://localhost:5000 erreichbar."
