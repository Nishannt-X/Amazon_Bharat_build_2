import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import sharp from "sharp";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, ".cache"), { recursive: true });
const directory = mkdtempSync(join(root, ".cache", "seed-samples-"));
try {
  for (const name of ["map-region", "report", "report-store", "sample-reports"]) {
    const source = readFileSync(join(root, "src", "lib", `${name}.ts`), "utf8");
    const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
    writeFileSync(join(directory, `${name}.js`), result.outputText);
  }
  const require = createRequire(import.meta.url);
  const { seedSampleReports } = require(join(directory, "report-store.js"));
  const { createSampleReports } = require(join(directory, "sample-reports.js"));
  const photo = await sharp(join(root, "public", "flood-demo.jpg")).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  await seedSampleReports(createSampleReports(photo.length), photo);
  console.log("Six labelled sample incidents stored in SQLite. Existing reports preserved. Re-running does not duplicate samples.");
} finally { rmSync(directory, { recursive: true, force: true }); }
