import {
  getAccountByEmailFromCloud,
  saveAccountToCloud,
  saveSessionToCloud,
  deleteSessionFromCloud,
  addGarageCarToCloud
} from "./aws/cloud-store";
import { isDynamoConfigured } from "./aws/dynamodb";
import Database from "better-sqlite3";
import { mkdirSync, chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { VEHICLE_NAMES } from "./vehicle-catalog";

const derive = promisify(scrypt);
const globals = globalThis as typeof globalThis & { accountDatabases?: Map<string, Database.Database> };
export function accountDatabase() {
  const directory = process.env.REPORT_STORE_DIR || path.join(process.cwd(), ".data", "reports");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "accounts.sqlite");
  globals.accountDatabases ??= new Map();
  const cached = globals.accountDatabases.get(filename);
  if (cached) return cached;
  const db = new Database(filename);
  chmodSync(/* turbopackIgnore: true */ filename, 0o600);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS garage(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),vehicle_id TEXT NOT NULL,model_year TEXT NOT NULL,variant TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS garage_owner ON garage(account_id);
    CREATE TABLE IF NOT EXISTS auth_attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
  // SQLite creates sidecars at runtime; never trace user data into build output.
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = filename+suffix;
    if (existsSync(/* turbopackIgnore: true */ sidecar)) chmodSync(/* turbopackIgnore: true */ sidecar, 0o600);
  }
  globals.accountDatabases.set(filename, db);
  return db;
}
export interface Account { id: string; email: string }
export interface GarageCar { id: string; vehicleId: string; make: string; model: string; year: string; variant: string }
export function validateCredentials(email: unknown, password: unknown) {
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter a valid email address.");
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("Use a password with 12–128 characters.");
  return { email: email.trim().toLowerCase(), password };
}
export async function createAccount(email: unknown, password: unknown): Promise<Account> {
  const credentials = validateCredentials(email, password);
  const salt = randomBytes(32).toString("hex");
  const hash = (await derive(credentials.password, salt, 64)) as Buffer;
  const account = { id: randomUUID(), email: credentials.email };
  if (isDynamoConfigured()) {
    const existing = await getAccountByEmailFromCloud(credentials.email);
    if (existing) throw new Error("Unable to register with those details. Try signing in.");
    await saveAccountToCloud({
      id: account.id,
      email: account.email,
      password_hash: hash.toString("hex"),
      salt,
      created_at: Date.now()
    });
  }
  try { accountDatabase().prepare("INSERT INTO accounts VALUES(?,?,?,?,?)").run(account.id, account.email, hash.toString("hex"), salt, Date.now()); }
  catch (_e) { void _e;
    if (!isDynamoConfigured()) throw new Error("Unable to register with those details. Try signing in.");
  }
  return account;
}
export async function authenticate(email: unknown, password: unknown): Promise<Account | null> {
  const credentials = validateCredentials(email, password);
  let row: (Account & { password_hash: string; salt: string }) | undefined;
  if (isDynamoConfigured()) {
    const cloudAcc = await getAccountByEmailFromCloud(credentials.email);
    row = cloudAcc ?? undefined;
  } else {
    row = accountDatabase().prepare("SELECT id,email,password_hash,salt FROM accounts WHERE email=?").get(credentials.email) as (Account & {password_hash:string;salt:string}) | undefined;
  }
  // Missing users still incur the same scrypt work; no credentials leave this module.
  const hash = (await derive(credentials.password, row?.salt ?? "0".repeat(64), 64)) as Buffer;
  const expected = Buffer.from(row?.password_hash ?? "0".repeat(128), "hex");
  if (!timingSafeEqual(hash, expected) || !row) return null;
  // A fresh cloud task needs its account cache before inserting a session's FK.
  accountDatabase().prepare("INSERT OR IGNORE INTO accounts VALUES(?,?,?,?,?)")
    .run(row.id,row.email,row.password_hash,row.salt,Date.now());
  return {id:row.id,email:row.email};
}
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function sessionToken(request: Request) { return request.headers.get("cookie")?.match(/(?:^|;\s*)ff_session=([a-f0-9]{64})(?:;|$)/)?.[1] ?? null; }
export function currentAccount(request: Request): Account | null {
  const token = sessionToken(request);
  if (!token) return null;
  return (accountDatabase().prepare("SELECT a.id,a.email FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?").get(tokenHash(token), Date.now()) as Account | undefined) ?? null;
}
/** An account ID is never a bearer credential for an anonymous evidence cookie. */
export function isAccountOwner(owner: string) { return Boolean(accountDatabase().prepare("SELECT id FROM accounts WHERE id=?").get(owner)); }
export function createSession(account: Account) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 7 * 86400000;
  if (isDynamoConfigured()) {
    void saveSessionToCloud(tokenHash(token), account.id, expiresAt);
  }
  const db = accountDatabase();
  db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(tokenHash(token), account.id, expiresAt);
  return token;
}
export function revokeSession(request: Request) {
  const token = sessionToken(request);
  if (token) {
    if (isDynamoConfigured()) void deleteSessionFromCloud(tokenHash(token));
    accountDatabase().prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
  }
}
export function secureCookie(request: Request) { return process.env.FLOODFLOW_PUBLIC_PROTOCOL === "https" || new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" || request.headers.get("origin")?.startsWith("https://") === true; }
export function sessionCookie(request: Request, token: string | null) { return `ff_session=${token ?? ""}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}${secureCookie(request) ? "; Secure" : ""}`; }
export function guardAccountMutation(request: Request, bucket: string, limit = 10) {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  const forwardedProtocol = process.env.FLOODFLOW_PUBLIC_PROTOCOL || request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http" ? `${forwardedProtocol}:` : new URL(request.url).protocol;
  if (!origin) throw new Error("Submit from this site's account form.");
  const source = new URL(origin);
  const hostName = host.split(":")[0];
  const directHost = (request.headers.get("host") || "").split(":")[0];
  const matchesHost =
    source.host === host ||
    source.hostname === hostName ||
    (directHost !== "" && source.hostname === directHost) ||
    source.hostname.endsWith(".cloudfront.net") ||
    source.hostname === "localhost" ||
    source.hostname === "127.0.0.1";
  if (!matchesHost || source.protocol !== protocol) throw new Error("Submit from this site's account form.");
  const key = tokenHash(bucket);
  const db = accountDatabase();
  db.prepare("DELETE FROM auth_attempts WHERE expires_at<=?").run(Date.now());
  const count = db.prepare("SELECT count FROM auth_attempts WHERE bucket=?").get(key) as {count:number}|undefined;
  if (count && count.count >= limit) throw new Error("Too many attempts. Wait 15 minutes.");
  db.prepare("INSERT INTO auth_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1").run(key, Date.now()+900000);
}
export function readGarage(owner: string): GarageCar[] {
  const rows = accountDatabase().prepare("SELECT id,vehicle_id,model_year,variant FROM garage WHERE account_id=? ORDER BY created_at,id").all(owner) as {id:string;vehicle_id:string;model_year:string;variant:string}[];
  return rows.flatMap(row => { const entry = VEHICLE_NAMES.find(item=>item.id === row.vehicle_id); return entry ? [{id:row.id,vehicleId:entry.id,make:entry.make,model:entry.model,year:row.model_year,variant:row.variant}] : []; });
}
export function addGarageCar(owner: string, body: Record<string, unknown>) {
  const entry = VEHICLE_NAMES.find(item=>item.id===body.vehicleId && item.make !== "DTC");
  const year = String(body.year ?? "");
  const variant = body.variant ?? "";
  if (!entry || !/^\d{4}$/.test(year) || Number(year)<1980 || Number(year)>new Date().getFullYear() || typeof variant!=="string" || variant.length>100) throw new Error("Choose a car and valid model year; trim must be at most 100 characters.");
  if(readGarage(owner).length>=30) throw new Error("Your garage supports up to 30 cars.");
  const carId = randomUUID();
  if (isDynamoConfigured()) void addGarageCarToCloud({ id: carId, account_id: owner, vehicle_id: entry.id, model_year: year, variant: variant.trim(), created_at: Date.now() });
  accountDatabase().prepare("INSERT INTO garage VALUES(?,?,?,?,?,?)").run(carId, owner, entry.id,year,variant.trim(),Date.now());
  return readGarage(owner);
}
