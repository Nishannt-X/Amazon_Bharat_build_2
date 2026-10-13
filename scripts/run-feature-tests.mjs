import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,cpSync} from "node:fs";
import {join,dirname} from "node:path";
import {spawnSync} from "node:child_process";
import ts from "typescript";
const directory=mkdtempSync(join(process.cwd(),".cache/feature-tests-"));
try {
 for(const file of ["lib/account-store","lib/vehicle-store","lib/vehicle-physical-evidence","lib/vehicle-catalog","lib/vehicle-research","lib/vehicle-report-context","lib/vehicle-recommendations","lib/photo-analysis","lib/context-questions","lib/context-assessment","lib/voice-language","lib/aws/bedrock","lib/aws/runtime","lib/aws/dynamodb","lib/aws/s3","lib/aws/cloud-store","lib/report","lib/analysis-store","lib/analysis-http","lib/report-store","lib/map-region","app/api/account/route","app/api/garage/route","app/api/vehicles/route","app/api/recommendations/route","app/api/analysis/[id]/answers/route","lib/features.test"]){
  const source=readFileSync(`src/${file}.ts`,"utf8");const output=join(directory,`${file}.js`);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
 }
 cpSync("src/data",join(directory,"data"),{recursive:true});
 const result=spawnSync(process.execPath,["--test",join(directory,"lib/features.test.js")],{stdio:"inherit"});process.exitCode=result.status??1;
}finally{rmSync(directory,{recursive:true,force:true});}
