import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@/lib/config';
import type { CardData, CardRecord, KnownShortcut, Station, StationExitOption } from '@/lib/types';

// Nur serverseitig verwenden (API-Routes)! better-sqlite3 ist ein
// natives Node-Modul und funktioniert nicht im Browser/Client-Code.

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = path.resolve(process.cwd(), config.db.path);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startpoint_label TEXT NOT NULL,
      startpoint_lat REAL NOT NULL,
      startpoint_lon REAL NOT NULL,
      target_street TEXT NOT NULL,
      target_lat REAL NOT NULL,
      target_lon REAL NOT NULL,
      station TEXT NOT NULL,
      district TEXT NOT NULL,
      description TEXT NOT NULL,
      map_image_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Wachen, stationsbezogene Ausfahrtsrichtungen und wachenübergreifende
    -- Abkürzungen (siehe Kommentare bei den zugehörigen Typen in types.ts)
    -- leben bewusst in der Datenbank statt in Code-Dateien: sie müssen sich
    -- über die Verwaltungsoberfläche (/verwaltung) pflegen lassen, auch
    -- ohne Zugriff auf den Quellcode (z. B. sobald die App im städtischen
    -- Netz läuft).
    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      kuerzel TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS station_exit_options (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      fixed_prefix TEXT NOT NULL,
      route_start_lat REAL NOT NULL,
      route_start_lon REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS known_shortcuts (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      station_id TEXT REFERENCES stations(id) ON DELETE CASCADE,
      via_lat REAL NOT NULL,
      via_lon REAL NOT NULL
    );
  `);

  seedStationsIfEmpty(dbInstance);

  return dbInstance;
}

/**
 * Einmalige Erstbefüllung beim allerersten Start (leere stations-Tabelle) -
 * damit die bisher im Code hinterlegten Münchner Beispieldaten nicht
 * verloren gehen. Ab dem ersten Start läuft alles Weitere ausschließlich
 * über die Verwaltungsoberfläche (/verwaltung), diese Funktion greift dann
 * nie wieder.
 */
function seedStationsIfEmpty(db: Database.Database): void {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM stations').get() as { count: number };
  if (count > 0) return;

  const insertStation = db.prepare(`
    INSERT INTO stations (id, kuerzel, name, address, lat, lon, sort_order)
    VALUES (@id, @kuerzel, @name, @address, @lat, @lon, @sortOrder)
  `);
  const insertExitOption = db.prepare(`
    INSERT INTO station_exit_options (id, station_id, label, fixed_prefix, route_start_lat, route_start_lon, sort_order)
    VALUES (@id, @stationId, @label, @fixedPrefix, @routeStartLat, @routeStartLon, @sortOrder)
  `);
  const insertShortcut = db.prepare(`
    INSERT INTO known_shortcuts (id, description, station_id, via_lat, via_lon)
    VALUES (@id, @description, @stationId, @viaLat, @viaLon)
  `);

  const seed = db.transaction(() => {
    insertStation.run({
      id: 'fw1', kuerzel: 'FW 1', name: 'Feuerwache 1',
      address: 'Blumenstraße 22, 80331 München', lat: 48.1329, lon: 11.5717, sortOrder: 0,
    });
    insertStation.run({
      id: 'fw4', kuerzel: 'FW 4', name: 'Feuerwache 4',
      address: 'Heßstraße 120, 80797', lat: 48.1564, lon: 11.5554, sortOrder: 1,
    });
    insertExitOption.run({
      id: crypto.randomUUID(),
      stationId: 'fw4',
      label: 'Links (über Schwere-Reiter-Str.)',
      fixedPrefix: 're. Heßstr. – li. Schwere-Reiter-Str.',
      routeStartLat: 48.1598,
      routeStartLon: 11.5482,
      sortOrder: 0,
    });
    insertShortcut.run({
      id: crypto.randomUUID(),
      description:
        'Letztes Stück der Leonrodstraße (Höhe Rotkreuzplatz) entgegen der Einbahnstraße ' +
        'befahren, um direkt auf die Wendl-Dietrich-Str. zu gelangen.',
      stationId: null,
      viaLat: 48.1528872,
      viaLon: 11.5321738,
    });
  });
  seed();
}

// -----------------------------------------------------------------------
// Wachen (Stations)
// -----------------------------------------------------------------------

function rowToStation(row: any, exitOptions: StationExitOption[]): Station {
  return {
    id: row.id,
    kuerzel: row.kuerzel,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lon: row.lon,
    exitOptions,
  };
}

function rowToExitOption(row: any): StationExitOption {
  return {
    id: row.id,
    label: row.label,
    fixedPrefix: row.fixed_prefix,
    routeStartPoint: { lat: row.route_start_lat, lon: row.route_start_lon },
  };
}

export function listStations(): Station[] {
  const db = getDb();
  const stationRows = db.prepare('SELECT * FROM stations ORDER BY sort_order, name').all() as any[];
  const exitOptionRows = db
    .prepare('SELECT * FROM station_exit_options ORDER BY sort_order')
    .all() as any[];
  return stationRows.map((row) =>
    rowToStation(
      row,
      exitOptionRows.filter((o) => o.station_id === row.id).map(rowToExitOption)
    )
  );
}

export function getStationByIdDb(id: string): Station | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM stations WHERE id = ?').get(id) as any;
  if (!row) return null;
  const exitOptionRows = db
    .prepare('SELECT * FROM station_exit_options WHERE station_id = ? ORDER BY sort_order')
    .all(id) as any[];
  return rowToStation(row, exitOptionRows.map(rowToExitOption));
}

export function createStation(data: Omit<Station, 'exitOptions'>): Station {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM stations').get() as { count: number };
  db.prepare(`
    INSERT INTO stations (id, kuerzel, name, address, lat, lon, sort_order)
    VALUES (@id, @kuerzel, @name, @address, @lat, @lon, @sortOrder)
  `).run({ ...data, sortOrder: count });
  return getStationByIdDb(data.id)!;
}

export function updateStation(id: string, data: Omit<Station, 'id' | 'exitOptions'>): Station | null {
  const db = getDb();
  db.prepare(`
    UPDATE stations SET kuerzel = @kuerzel, name = @name, address = @address, lat = @lat, lon = @lon
    WHERE id = @id
  `).run({ ...data, id });
  return getStationByIdDb(id);
}

export function deleteStation(id: string): void {
  getDb().prepare('DELETE FROM stations WHERE id = ?').run(id);
}

export function createExitOption(
  stationId: string,
  data: Omit<StationExitOption, 'id'>
): StationExitOption {
  const db = getDb();
  const id = crypto.randomUUID();
  const { count } = db
    .prepare('SELECT COUNT(*) AS count FROM station_exit_options WHERE station_id = ?')
    .get(stationId) as { count: number };
  db.prepare(`
    INSERT INTO station_exit_options (id, station_id, label, fixed_prefix, route_start_lat, route_start_lon, sort_order)
    VALUES (@id, @stationId, @label, @fixedPrefix, @routeStartLat, @routeStartLon, @sortOrder)
  `).run({
    id,
    stationId,
    label: data.label,
    fixedPrefix: data.fixedPrefix,
    routeStartLat: data.routeStartPoint.lat,
    routeStartLon: data.routeStartPoint.lon,
    sortOrder: count,
  });
  return rowToExitOption(db.prepare('SELECT * FROM station_exit_options WHERE id = ?').get(id));
}

export function updateExitOption(
  id: string,
  data: Omit<StationExitOption, 'id'>
): StationExitOption | null {
  const db = getDb();
  db.prepare(`
    UPDATE station_exit_options SET
      label = @label, fixed_prefix = @fixedPrefix,
      route_start_lat = @routeStartLat, route_start_lon = @routeStartLon
    WHERE id = @id
  `).run({
    id,
    label: data.label,
    fixedPrefix: data.fixedPrefix,
    routeStartLat: data.routeStartPoint.lat,
    routeStartLon: data.routeStartPoint.lon,
  });
  const row = db.prepare('SELECT * FROM station_exit_options WHERE id = ?').get(id);
  return row ? rowToExitOption(row) : null;
}

export function deleteExitOption(id: string): void {
  getDb().prepare('DELETE FROM station_exit_options WHERE id = ?').run(id);
}

// -----------------------------------------------------------------------
// Bekannte Abkürzungen (Known Shortcuts)
// -----------------------------------------------------------------------

function rowToShortcut(row: any): KnownShortcut {
  return {
    id: row.id,
    description: row.description,
    stationId: row.station_id,
    viaPoint: { lat: row.via_lat, lon: row.via_lon },
  };
}

export function listKnownShortcuts(): KnownShortcut[] {
  return (getDb().prepare('SELECT * FROM known_shortcuts').all() as any[]).map(rowToShortcut);
}

export function createShortcut(data: Omit<KnownShortcut, 'id'>): KnownShortcut {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO known_shortcuts (id, description, station_id, via_lat, via_lon)
    VALUES (@id, @description, @stationId, @viaLat, @viaLon)
  `).run({
    id,
    description: data.description,
    stationId: data.stationId,
    viaLat: data.viaPoint.lat,
    viaLon: data.viaPoint.lon,
  });
  return rowToShortcut(db.prepare('SELECT * FROM known_shortcuts WHERE id = ?').get(id));
}

export function updateShortcut(id: string, data: Omit<KnownShortcut, 'id'>): KnownShortcut | null {
  const db = getDb();
  db.prepare(`
    UPDATE known_shortcuts SET description = @description, station_id = @stationId,
      via_lat = @viaLat, via_lon = @viaLon
    WHERE id = @id
  `).run({
    id,
    description: data.description,
    stationId: data.stationId,
    viaLat: data.viaPoint.lat,
    viaLon: data.viaPoint.lon,
  });
  const row = db.prepare('SELECT * FROM known_shortcuts WHERE id = ?').get(id);
  return row ? rowToShortcut(row) : null;
}

export function deleteShortcut(id: string): void {
  getDb().prepare('DELETE FROM known_shortcuts WHERE id = ?').run(id);
}

function rowToCard(row: any): CardRecord {
  return {
    id: row.id,
    startpointLabel: row.startpoint_label,
    startpointLat: row.startpoint_lat,
    startpointLon: row.startpoint_lon,
    targetStreet: row.target_street,
    targetLat: row.target_lat,
    targetLon: row.target_lon,
    station: row.station,
    district: row.district,
    description: row.description,
    mapImagePath: row.map_image_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertCard(data: CardData): CardRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO cards (
      startpoint_label, startpoint_lat, startpoint_lon,
      target_street, target_lat, target_lon,
      station, district, description, map_image_path,
      created_at, updated_at
    ) VALUES (
      @startpointLabel, @startpointLat, @startpointLon,
      @targetStreet, @targetLat, @targetLon,
      @station, @district, @description, @mapImagePath,
      @createdAt, @updatedAt
    )
  `);
  const info = stmt.run({ ...data, createdAt: now, updatedAt: now });
  return getCard(Number(info.lastInsertRowid))!;
}

export function updateCard(id: number, data: CardData): CardRecord | null {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE cards SET
      startpoint_label = @startpointLabel,
      startpoint_lat = @startpointLat,
      startpoint_lon = @startpointLon,
      target_street = @targetStreet,
      target_lat = @targetLat,
      target_lon = @targetLon,
      station = @station,
      district = @district,
      description = @description,
      map_image_path = @mapImagePath,
      updated_at = @updatedAt
    WHERE id = @id
  `);
  stmt.run({ ...data, id, updatedAt: now });
  return getCard(id);
}

export function getCard(id: number): CardRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  return row ? rowToCard(row) : null;
}

export function listCards(limit = 50): CardRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM cards ORDER BY created_at DESC LIMIT ?')
    .all(limit);
  return rows.map(rowToCard);
}
