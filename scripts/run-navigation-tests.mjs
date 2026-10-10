import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const dir = mkdtempSync(join(tmpdir(), 'ff-navigation-'));
try {
  for (const name of ['navigation','navigation-provider','navigation.test','vehicle-catalog']) {
    let source = readFileSync(`src/lib/${name}.ts`,'utf8');
    if(name==='vehicle-catalog') source=source.replace('import vehicleNames from "../data/vehicles.json";',`const vehicleNames = ${readFileSync('src/data/vehicles.json','utf8')};`);
    writeFileSync(join(dir,`${name}.js`),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  }
  const result=spawnSync(process.execPath,['--test',join(dir,'navigation.test.js')],{stdio:'inherit'});
  process.exitCode=result.status??1;
} finally {rmSync(dir,{recursive:true,force:true});}
