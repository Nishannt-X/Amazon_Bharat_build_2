import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const root=join(process.cwd(),'.cache');mkdirSync(root,{recursive:true});const directory=mkdtempSync(join(root,'context-tests-'));
try {
 for(const name of ['context-assessment','context-assessment.test','photo-analysis','voice-language','context-questions','aws/bedrock']){const out=join(directory,name+'.js');mkdirSync(dirname(out),{recursive:true});writeFileSync(out,ts.transpileModule(readFileSync('src/lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);}
 const result=spawnSync(process.execPath,['--test',join(directory,'context-assessment.test.js')],{stdio:'inherit'});process.exitCode=result.status??1;
}finally{rmSync(directory,{recursive:true,force:true});}
