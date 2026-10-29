// Explicit development operation; normal site builds use the committed snapshot.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]||'../../jams-history-rpg');
const pkg=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
if(pkg.name!=='jams-timequest-prototype')throw new Error('Expected the jams-history-rpg source checkout');
if(execFileSync('git',['-C',source,'status','--porcelain'],{encoding:'utf8'}).trim())throw new Error('Commit RPG source before syncing a reproducible site snapshot');
await mkdir('timequest/public',{recursive:true});
const hashes={};
for(const name of ['app.js','style.css','map.js','movement.js','index.html']){
  const text=await readFile(join(source,'public',name),'utf8');
  hashes['public/'+name]=createHash('sha256').update(text).digest('hex');
  await writeFile(join('timequest/public',name),name==='index.html'?text.replace('href="/style.css"','href="/timequest/style.css"').replace('src="/app.js"','src="/timequest/app.js"'):text);
}
const world=await readFile(join(source,'server/world.js'),'utf8');
hashes['server/world.js']=createHash('sha256').update(world).digest('hex');
await writeFile('timequest/world.mjs',world);
await writeFile('timequest/public/runtime.js',"export const apiRoot = '/api/timequest/';\nexport const sharedAccount = true;\n");
const commit=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
await writeFile('timequest/source.json',JSON.stringify({repository:'jjs760816-code/jams-history-rpg',commit,version:pkg.version,sha256:hashes},null,2)+'\n');
console.log('Synced timequest '+pkg.version+' from '+commit);
