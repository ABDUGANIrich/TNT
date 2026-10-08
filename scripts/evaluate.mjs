import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSource } from '../dist/source.js';
import { resolve } from '../dist/dependencies.js';
import { generateRouter } from '../dist/router.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=await loadSource();const {manifest}=resolve(source.manifest,['*']);
const template=await fs.readFile(path.join(root,'templates/router.md'),'utf8');
const tree=generateRouter(manifest,template);
const flatRows=[...manifest.skills.map(s=>({path:`${s.path}/${s.entry}`,text:`${s.description} [skill: ${s.id}]`})),...manifest.resources.map(r=>({path:r.path,text:`${r.description} [resource: ${r.id}; read only when needed]`}))].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
// Same navigation and prerequisite section; only the discovery catalog representation differs.
const flat=tree.replace(/## Installed tree\n\n```text\n[\s\S]*?\n```/,`## Installed flat catalog\n\n${flatRows.map(r=>'- '+r.path+' — '+r.text).join('\n')}`);
const size=text=>({utf8Bytes:Buffer.byteLength(text),unicodeCodePoints:[...text].length,estimatedTokens:Math.ceil([...text].length/4)});
const stats={schemaVersion:1,sourceRevision:source.ref.revision,skills:manifest.skills.length,resources:manifest.resources.length,treeRouter:size(tree),flatCatalog:size(flat),instructionBytes:manifest.skills.reduce((n,s)=>n+source.files.get(`${s.path}/${s.entry}`).length,0),tokenMethod:'Estimate only: ceil(Unicode code points / 4). No tokenizer used.',agentRunsPerformed:0,claims:'Artifact size only. No measured routing accuracy, task success, latency, or total task-token results.'};
const output=path.join(root,'artifacts/evaluation');await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'tree.md'),tree);await fs.writeFile(path.join(output,'flat.md'),flat);await fs.writeFile(path.join(output,'sizes.json'),JSON.stringify(stats,null,2)+'\n');
await fs.copyFile(path.join(root,'evaluation/tasks.json'),path.join(output,'tasks.json'));
console.log(JSON.stringify(stats,null,2));
