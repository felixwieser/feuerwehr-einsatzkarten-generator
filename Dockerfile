# Produktions-Image für den Feuerwehr-Einsatzkarten-Generator.
#
# Enthält neben Node.js auch die System-Bibliotheken, die das von Puppeteer
# mitgelieferte Chromium zur Laufzeit braucht (Karten-/PDF-Rendering, siehe
# src/lib/browser.ts) - ein normales "node:20-slim"-Image hat diese nicht
# vorinstalliert, Chromium würde sonst sofort abstürzen.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
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

# Nur package*.json zuerst kopieren, damit "npm ci" (inkl. Chromium-Download
# + postinstall-Skript für den MapLibre-Worker, siehe package.json) im
# Docker-Layer-Cache bleibt, solange sich die Abhängigkeiten nicht ändern.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

# Persistentes Volume beim Hoster auf /app/persist mounten (siehe
# DEPLOY.md) - das Entrypoint-Skript richtet daraus DB + generierte
# Kartenbilder ein, bevor der eigentliche Server startet.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
