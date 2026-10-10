import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, ".cache"), { recursive: true });
const directory = mkdtempSync(join(root, ".cache", "shared-report-tests-"));
try {
  for (const file of ["lib/map-region", "lib/report", "lib/sample-reports", "lib/report-store", "lib/report-store.test", "lib/shared-reports-api.test", "app/api/reports/route"]) {
    const source = readFileSync(join(root, "src", `${file}.ts`), "utf8");
    const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
    mkdirSync(dirname(join(directory, `${file}.js`)), { recursive: true });
    writeFileSync(join(directory, `${file}.js`), result.outputText);
  }
  const result = spawnSync(process.execPath, ["--test", join(directory, "lib/report-store.test.js"), join(directory, "lib/shared-reports-api.test.js")], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
