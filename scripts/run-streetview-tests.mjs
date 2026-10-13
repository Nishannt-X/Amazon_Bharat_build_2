import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import ts from "typescript";
// Offline: a simulated panorama stands in for Google. Needs CV_PYTHON (or python3) with OpenCV.
const directory=mkdtempSync(join(tmpdir(),"streetview-tests-"));
try {
  for(const name of ["streetview","streetview.test"]){
    const out=join(directory,name+".js");mkdirSync(directory,{recursive:true});
    writeFileSync(out,ts.transpileModule(readFileSync("src/lib/"+name+".ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  }
  const result=spawnSync(process.execPath,["--test","--test-timeout=300000",join(directory,"streetview.test.js")],{stdio:"inherit"});process.exitCode=result.status??1;
}finally{rmSync(directory,{recursive:true,force:true});}
