/** Run the built-in Node test runner using the already-installed TypeScript
 * compiler. Works on Node 20.9+ without native type-stripping flags. */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

export function runTsTests(name) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = mkdtempSync(join(tmpdir(), `ff-${name}-`));
  try {
    for (const suffix of ["", ".test"]) {
      let source = readFileSync(join(root, "src/lib", `${name}${suffix}.ts`), "utf8");
      if (name === "vehicle-catalog" && suffix === "") {
        const json = readFileSync(join(root, "src/data/vehicles.json"), "utf8");
        JSON.parse(json);
        const inlined = source.replace('import vehicleNames from "../data/vehicles.json";', `const vehicleNames = ${json};`);
        if (inlined === source) throw new Error("Vehicle data import was not found.");
        source = inlined;
      }
      const result = ts.transpileModule(source, {
        fileName: `${name}${suffix}.ts`,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        reportDiagnostics: true,
      });
      const errors = result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error) ?? [];
      if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (file) => file, getCurrentDirectory: () => root, getNewLine: () => "\n",
      }));
      writeFileSync(join(dir, `${name}${suffix}.js`), result.outputText);
    }
    const result = spawnSync(process.execPath, ["--test", join(dir, `${name}.test.js`)], { stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
