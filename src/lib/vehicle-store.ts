import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { VEHICLE_NAMES, findNameEntry } from "./vehicle-catalog";
import { isCarEntry, lookupResearchClearance, type ResearchClearance } from "./vehicle-research";
import type { VehicleReferenceStats } from "./vehicle-report-context";
import references from "../data/vehicle-oem-references.json";
const globals = globalThis as typeof globalThis & { vehicleDatabases?: Map<string, Database.Database> };
export function vehicleDatabase() {
  const directory = process.env.REPORT_STORE_DIR || path.join(process.cwd(), ".data", "reports");
  mkdirSync(directory,{recursive:true});
  const filename = path.join(directory,"vehicles.sqlite");
  globals.vehicleDatabases ??= new Map();
  const cached=globals.vehicleDatabases.get(filename);
  if(cached) return cached;
  const db=new Database(filename);db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS vehicle_catalog(id TEXT PRIMARY KEY,make TEXT NOT NULL,model TEXT NOT NULL,is_car INTEGER NOT NULL,research_json TEXT NOT NULL,reference_json TEXT,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL);`);
  const migration="vehicle-references-2026-10-11-v2";
  if(!db.prepare("SELECT name FROM migrations WHERE name=?").get(migration)) db.transaction(()=>{
    const insert=db.prepare("INSERT INTO vehicle_catalog VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET make=excluded.make,model=excluded.model,is_car=excluded.is_car,research_json=excluded.research_json,reference_json=excluded.reference_json,updated_at=excluded.updated_at");
    for(const entry of VEHICLE_NAMES) {
      const reference=references.find(row=>row.vehicleId===entry.id);
      insert.run(entry.id,entry.make,entry.model,isCarEntry(entry)?1:0,JSON.stringify(lookupResearchClearance(entry.make,entry.model)),reference?JSON.stringify(reference):null,"2026-10-11");
    }
    db.prepare("INSERT INTO migrations VALUES(?,?)").run(migration,new Date().toISOString());
  })();
  globals.vehicleDatabases.set(filename,db);return db;
}
export function readVehicleReference(make:string,model:string): {reference:VehicleReferenceStats|null;research:ResearchClearance|null} {
  const entry=findNameEntry(make,model);
  const row=entry?vehicleDatabase().prepare("SELECT reference_json,research_json FROM vehicle_catalog WHERE id=?").get(entry.id) as {reference_json:string|null;research_json:string}|undefined:undefined;
  return {reference:row?.reference_json?JSON.parse(row.reference_json):null,research:row?JSON.parse(row.research_json):null};
}
export function readVehicleCatalog() {
  return vehicleDatabase().prepare("SELECT id,make,model,reference_json IS NOT NULL AS hasOemReference FROM vehicle_catalog WHERE is_car=1 ORDER BY make,model").all();
}
