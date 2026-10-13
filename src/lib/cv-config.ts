import {readFile} from "node:fs/promises";
import path from "node:path";

/** Private, server-only CV settings. Explicit process environment takes precedence. */
export async function cvConfig() {
  let contents = "";
  try { contents = await readFile(path.join(process.cwd(), "env.cache"), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const entries: Record<string,string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(CV_[A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    entries[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  const value = (name:string) => process.env[name] || entries[name] || "";
  const timeout = Number(value("CV_SERVICE_TIMEOUT_MS") || 180000);
  return {
    localEnabled: value("CV_LOCAL_ENABLED") !== "false",
    python: value("CV_PYTHON") || "python3",
    referencePython: value("CV_REFERENCE_PYTHON") || value("CV_PYTHON") || "python3",
    serviceUrl: value("CV_SERVICE_URL"), token: value("CV_SERVICE_TOKEN"),
    timeoutMs: Number.isFinite(timeout) ? Math.max(1000, Math.min(240000, timeout)) : 180000,
  };
}
