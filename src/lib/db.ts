import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@/lib/config';
import type { CardData, CardRecord } from '@/lib/types';

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
  `);

  return dbInstance;
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
