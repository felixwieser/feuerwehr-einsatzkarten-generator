#!/bin/sh
# Bindet ein einzelnes persistentes Volume (vom Hoster an /app/persist
# gemountet) sowohl für die SQLite-Datenbank als auch für die generierten
# Kartenbilder ein.
#
# Die Kartenbilder MÜSSEN dabei weiterhin unter public/generated liegen -
# Next.js liefert sie darüber automatisch als statische Datei aus, es gibt
# keinen eigenen API-Handler dafür (siehe DEPLOY.md). Ein einfaches
# "GENERATED_DIR=/app/persist/generated" würde das kaputt machen. Deshalb
# hier stattdessen ein Symlink public/generated -> /app/persist/generated.
set -e

mkdir -p /app/persist/generated

if [ ! -L /app/public/generated ]; then
  rm -rf /app/public/generated
  ln -s /app/persist/generated /app/public/generated
fi

export DB_PATH="${DB_PATH:-/app/persist/app.db}"

exec "$@"
