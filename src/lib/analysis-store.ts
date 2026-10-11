import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AnalysisResult } from "./photo-analysis";
const globals = globalThis as typeof globalThis & {
  analysisDatabases?: Map<string, Database.Database>;
};
function db() {
  const root =
    process.env.REPORT_STORE_DIR?.trim() ||
    path.join(process.cwd(), ".data/reports");
  mkdirSync(root, { recursive: true });
  const filename = path.join(root, "analyses.sqlite");
  globals.analysisDatabases ??= new Map();
  const cached = globals.analysisDatabases.get(filename);
  if (cached) {
    ensureSnapshotColumn(cached);
    return cached;
  }
  const database = new Database(filename);
  database.pragma("journal_mode=WAL");
  database.exec(
    "CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at TEXT NOT NULL, result TEXT NOT NULL, photo BLOB NOT NULL, baseline BLOB); CREATE INDEX IF NOT EXISTS analyses_owner ON analyses(owner);",
  );
  if (
    !(
      database.prepare("PRAGMA table_info(analyses)").all() as {
        name: string;
      }[]
    ).some((c) => c.name === "baseline")
  )
    database.exec("ALTER TABLE analyses ADD COLUMN baseline BLOB");
  ensureSnapshotColumn(database);
  globals.analysisDatabases.set(filename, database);
  return database;
}
export function saveAnalysis(
  result: AnalysisResult,
  photo?: Buffer,
  baseline?: Buffer | null,
) {
  if (photo)
    db()
      .prepare(
        "INSERT INTO analyses(id,owner,created_at,result,photo,baseline,photo_result) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        result.id,
        result.owner,
        result.createdAt,
        JSON.stringify(result),
        photo,
        baseline ?? null,
        JSON.stringify(result),
      );
  else
    db()
      .prepare("UPDATE analyses SET result=? WHERE id=? AND owner=?")
      .run(JSON.stringify(result), result.id, result.owner);
}
export function readAnalysis(
  id: string,
  owner?: string,
): AnalysisResult | null {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = db()
    .prepare("SELECT owner,result FROM analyses WHERE id=?")
    .get(id) as { owner: string; result: string } | undefined;
  return row && (!owner || row.owner === owner) ? JSON.parse(row.result) : null;
}
export function analysisPhoto(id: string, owner: string): Buffer | null {
  const row = db()
    .prepare("SELECT photo FROM analyses WHERE id=? AND owner=?")
    .get(id, owner) as { photo: Buffer } | undefined;
  return row?.photo ?? null;
}

/** Claim only the guest session presented during successful authentication. */
export function claimGuestAnalyses(guest: string, owner: string) {
  db().transaction(() => {
    const rows = db().prepare("SELECT id,result,photo_result FROM analyses WHERE owner=?").all(guest) as {id:string;result:string;photo_result:string|null}[];
    for (const row of rows) {
      const result = {...JSON.parse(row.result),owner};
      const photo = row.photo_result ? {...JSON.parse(row.photo_result),owner} : null;
      db().prepare("UPDATE analyses SET owner=?,result=?,photo_result=? WHERE id=? AND owner=?").run(owner,JSON.stringify(result),photo?JSON.stringify(photo):null,row.id,guest);
    }
  })();
}

export function analysisBaseline(id: string, owner: string): Buffer | null {
  const row = db()
    .prepare("SELECT baseline FROM analyses WHERE id=? AND owner=?")
    .get(id, owner) as { baseline: Buffer | null } | undefined;
  return row?.baseline ?? null;
}

const migratedSnapshots = new WeakSet<Database.Database>();
function ensureSnapshotColumn(database: Database.Database) {
  if (migratedSnapshots.has(database)) return;
  if (
    !(
      database.prepare("PRAGMA table_info(analyses)").all() as {
        name: string;
      }[]
    ).some((c) => c.name === "photo_result")
  )
    database.exec("ALTER TABLE analyses ADD COLUMN photo_result TEXT");
  database.exec(
    "UPDATE analyses SET photo_result=result WHERE photo_result IS NULL AND json_array_length(result, '$.answers') = 0",
  );
  migratedSnapshots.add(database);
}
/** Follow-up edits never overwrite the original photo-only calculation. */
export function readPhotoAnalysis(
  id: string,
  owner: string,
): AnalysisResult | null {
  const row = db()
    .prepare("SELECT result,photo_result FROM analyses WHERE id=? AND owner=?")
    .get(id, owner) as
    { result: string; photo_result: string | null } | undefined;
  if (!row) return null;
  if (row.photo_result) return JSON.parse(row.photo_result);
  const legacy: AnalysisResult = JSON.parse(row.result);
  return legacy.answers.length === 0 ? legacy : null;
}
