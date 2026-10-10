import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const dir = mkdtempSync(join(tmpdir(), "ff-vehicle-research-"));
const inline = (source, importLine, file) =>
  source.replace(importLine, `const ${importLine.split(" ")[1]} = ${readFileSync(file, "utf8")};`);
try {
  for (const name of ["vehicle-research", "vehicle-research.test", "vehicle-catalog"]) {
    let source = readFileSync(`src/lib/${name}.ts`, "utf8");
    if (name === "vehicle-catalog") source = inline(source, 'import vehicleNames from "../data/vehicles.json";', "src/data/vehicles.json");
    if (name === "vehicle-research") source = inline(source, 'import research from "../data/vehicle-ground-clearance-research.json";', "src/data/vehicle-ground-clearance-research.json");
    writeFileSync(join(dir, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
  const result = spawnSync(process.execPath, ["--test", join(dir, "vehicle-research.test.js")], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
