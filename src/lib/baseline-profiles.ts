import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DryBaselineProfile } from "./photo-analysis";
const exec = promisify(execFile);
/** Immutable, content-addressed dry inventories survive uploads and server restarts. */
export async function dryBaselineProfile(imagePath: string, hash: string): Promise<DryBaselineProfile> {
  const directory = process.env.REPORT_STORE_DIR || path.join(process.cwd(), ".data/reports");
  mkdirSync(directory, { recursive: true });
  const database = new Database(path.join(directory, "baseline-profiles.sqlite"));
  try {
    database.exec("CREATE TABLE IF NOT EXISTS profiles (image_hash TEXT PRIMARY KEY, profile TEXT NOT NULL)");
    const cached = database.prepare("SELECT profile FROM profiles WHERE image_hash=?").get(hash) as {profile:string}|undefined;
    if (cached) return JSON.parse(cached.profile);
    const {stdout} = await exec(process.env.CV_PYTHON || "python3", [path.join(process.cwd(), "scripts/cv/analyze_dry.py"), imagePath], {timeout:20000,maxBuffer:1024*1024});
    const profile: DryBaselineProfile = JSON.parse(stdout);
    // Retry missing optional weights on a subsequent upload after model setup.
    if (profile.detectorStatus === "fasterrcnn-mobilenet-coco")
      database.prepare("INSERT OR IGNORE INTO profiles VALUES(?,?)").run(hash, JSON.stringify(profile));
    return profile;
  } finally { database.close(); }
}
