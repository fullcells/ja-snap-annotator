import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const stage=mkdtempSync(join(tmpdir(),'ja-snap-release-'));
const output=join(process.cwd(),'releases');mkdirSync(output,{recursive:true});
try {
 for(const file of [...manifest.files,'README.md','LICENSE.md','THIRD_PARTY_NOTICES.md']) cpSync(file,join(stage,file),{recursive:true});
 delete manifest.scripts;delete manifest.devDependencies;
 writeFileSync(join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(execFileSync('npm',['pack','--json','--pack-destination',output],{cwd:stage,encoding:'utf8'}));
} finally {rmSync(stage,{recursive:true,force:true});}
