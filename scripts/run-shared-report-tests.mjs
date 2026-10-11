import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  cpSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, ".cache"), { recursive: true });
const directory = mkdtempSync(join(root, ".cache", "shared-report-tests-"));
try {
  mkdirSync(join(directory,"data"), {recursive:true});
  for(const file of ["vehicles.json","vehicle-ground-clearance-research.json"]) cpSync(join(root,"src/data",file),join(directory,"data",file));
  for (const file of [
    "lib/account-store","lib/aws/dynamodb","lib/aws/s3","lib/aws/cloud-store",
    "lib/vehicle-catalog",
    "lib/vehicle-research",
    "lib/analysis-store.test",
    "app/api/reports/[id]/route",
    "app/api/reports/[id]/photo/route",
    "app/api/reports/[id]/baseline/route",
    "lib/analysis-store",
    "lib/analysis-http",
    "lib/voice-language",
    "lib/reverse-geocode",
    "lib/analysis-voice",
    "lib/photo-analysis",
    "lib/map-region",
    "lib/report",
    "lib/sample-reports",
    "lib/report-store",
    "lib/report-store.test",
    "lib/shared-reports-api.test",
    "app/api/reports/route",
  ]) {
    const source = readFileSync(join(root, "src", `${file}.ts`), "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    mkdirSync(dirname(join(directory, `${file}.js`)), { recursive: true });
    writeFileSync(join(directory, `${file}.js`), result.outputText);
  }
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      join(directory, "lib/analysis-store.test.js"),
      join(directory, "lib/report-store.test.js"),
      join(directory, "lib/shared-reports-api.test.js"),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
