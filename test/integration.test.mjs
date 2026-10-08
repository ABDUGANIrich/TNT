import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fixture, cli, changeManifest, treeSnapshot, repository } from './helpers.mjs';
import { mutate } from '../dist/service.js';
import { requireState } from '../dist/state.js';
import { loadSource } from '../dist/source.js';
import { planInstallation } from '../dist/planner.js';
import { commit, withMutation } from '../dist/filesystem.js';

const file=(f,p)=>path.join(f.project,'.skill-tree',p);
test('install preserves ancestry, skips siblings/ancestor files, merges and is idempotent',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.source,'web','private.txt'),'unlisted');
  cli(f.project,['install','web/react','--source',f.source]);
  assert.ok((await fs.stat(file(f,'web/react/forms/instructions.md'))).isFile());
  for(const p of ['react','web/vue','web/private.txt','database']) await assert.rejects(fs.stat(file(f,p)),{code:'ENOENT'});
  const before=await fs.readFile(file(f,'web/react/forms/instructions.md'));
  cli(f.project,['install','database/postgres']);
  assert.deepEqual(await fs.readFile(file(f,'web/react/forms/instructions.md')),before);
  const snap=await treeSnapshot(f.project); const stat=await fs.stat(file(f,'SKILL.md'));
  const result=JSON.parse(cli(f.project,['install','database/postgres','--json']).stdout);
  assert.equal(result.changed,false);assert.deepEqual(await treeSnapshot(f.project),snap);assert.equal((await fs.stat(file(f,'SKILL.md'))).mtimeMs,stat.mtimeMs);
  cli(f.project,['doctor']);
});
test('overlapping selections, shared dependencies, and exact removal preserve remaining intent',async t=>{
  const f=await fixture(t);
  cli(f.project,['install','web/react','web/react/forms','testing/integration']);
  cli(f.project,['remove','web/react']);
  let state=await requireState(f.project);
  assert.deepEqual(state.selection.selectors,['testing/integration','web/react/forms']);
  assert.ok(state.lock.manifest.skills.some(s=>s.id==='testing.test-design'));
  assert.ok(!state.lock.manifest.skills.some(s=>s.id==='react.performance'));
  cli(f.project,['remove','web/react/forms']);
  state=await requireState(f.project);assert.ok(state.lock.manifest.skills.some(s=>s.id==='testing.test-design'));
  assert.equal(state.lock.manifest.resources.length,0);
  cli(f.project,['remove','--all']);assert.equal((await requireState(f.project)).lock.manifest.skills.length,0);cli(f.project,['doctor']);
});
test('nested removal covered by parent explains conflict and leaves tree unchanged',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react']);const before=await treeSnapshot(f.project);
  assert.match(cli(f.project,['remove','web/react/forms'],1).stderr,/included by explicit selection web\/react/);
  assert.deepEqual(await treeSnapshot(f.project),before);
});
test('all is explicit, full install works, inspection and argument failures are clear',async t=>{
  const f=await fixture(t);cli(f.project,['install'],1);assert.deepEqual(await fs.readdir(f.project),[]);
  cli(f.project,['install','*'],1);cli(f.project,['install','--all']);
  assert.equal(JSON.parse(cli(f.project,['stats','--json']).stdout).skills,13);
  assert.match(cli(f.project,['tree']).stdout,/web\/[^\n]*\n[\s\S]*  react\/\n    forms\//);
  assert.match(cli(f.project,['search','form validation']).stdout,/react.forms/);
  assert.deepEqual(JSON.parse(cli(f.project,['search','Preserve valid zero','--json']).stdout),[]);
  assert.equal(JSON.parse(cli(f.project,['explain','react.forms','--json']).stdout).dependencies[0].kind,'skill');
  assert.equal(JSON.parse(cli(f.project,['list','--json']).stdout).skills.length,13);
  cli(f.project,['explain','missing'],1);cli(f.project,['search'],1);cli(f.project,['nonsense'],1);cli(f.project,['list','--dry-run'],1);
  const packageInfo=JSON.parse(await fs.readFile(path.join(repository,'package.json'),'utf8'));
  assert.equal(cli(f.project,['--version']).stdout.trim(),packageInfo.version);assert.match(cli(f.project,['--help']).stdout,/Usage:/);
});
test('every mutating dry run leaves even directory state unchanged',async t=>{
  const f=await fixture(t);let before=await treeSnapshot(f.project);
  const plan=JSON.parse(cli(f.project,['install','web/react','--host','codex','--dry-run','--json']).stdout);
  assert.ok(plan.additions.length);assert.match(plan.integration,/add Codex/);assert.ok(plan.dependencies.some(d=>d.id==='testing.test-design'));
  assert.deepEqual(await treeSnapshot(f.project),before);
  cli(f.project,['install','web/react']);before=await treeSnapshot(f.project);
  for(const args of [['remove','web/react'],['install','database/postgres'],['update','--source','bundled'],['recover']]) {
    cli(f.project,[...args,'--dry-run']);assert.deepEqual(await treeSnapshot(f.project),before);
  }
});
test('update is explicit, preserves source identity, and reconciles changed content',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--source',f.source]);
  const entry=path.join(f.source,'web/react/forms/instructions.md');await fs.appendFile(entry,'\nRevised guidance.\n');
  cli(f.project,['install','database/postgres'],1);cli(f.project,['update'],1);
  const before=await treeSnapshot(f.project);const plan=JSON.parse(cli(f.project,['update','--source',f.source,'--dry-run','--json']).stdout);
  assert.ok(plan.updates.includes('web/react/forms/instructions.md'));assert.deepEqual(await treeSnapshot(f.project),before);
  cli(f.project,['update','--source',f.source]);assert.match(await fs.readFile(file(f,'web/react/forms/instructions.md'),'utf8'),/Revised guidance/);
  await changeManifest(f.source,m=>m.id='different-library');cli(f.project,['update','--source',f.source],1);cli(f.project,['doctor']);
});
test('missing selected branches or invalid dependencies fail before update mutation',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--source',f.source]);const before=await treeSnapshot(f.project);
  await changeManifest(f.source,m=>m.skills=m.skills.filter(s=>!s.path.startsWith('web/react/')));
  cli(f.project,['update','--source',f.source],1);assert.deepEqual(await treeSnapshot(f.project),before);cli(f.project,['doctor']);
});
test('dependency cycles fail before install and before update',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--source',f.source]);const before=await treeSnapshot(f.project);
  await changeManifest(f.source,m=>m.skills.find(s=>s.id==='testing.test-design').dependencies=[{kind:'skill',id:'react.forms'}]);
  assert.match(cli(f.project,['update','--source',f.source],1).stderr,/cycle/);assert.deepEqual(await treeSnapshot(f.project),before);
  const fresh=path.join(f.base,'fresh');await fs.mkdir(fresh);cli(fresh,['install','web/react','--source',f.source],1);assert.deepEqual(await fs.readdir(fresh),[]);
});
test('remove works even if original source is unavailable',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--source',f.source]);await fs.rename(f.source,f.source+'-away');
  cli(f.project,['remove','web/react']);cli(f.project,['doctor']);
});
test('modified managed files and routers are never overwritten or removed',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react']);await fs.appendFile(file(f,'web/react/forms/instructions.md'),'user edit');
  const before=await treeSnapshot(f.project);
  for(const args of [['install','database/postgres'],['remove','web/react'],['update','--source','bundled'],['doctor']]) assert.match(cli(f.project,args,1).stderr,/locally modified/);
  assert.deepEqual(await treeSnapshot(f.project),before);
});
test('missing files cannot be advertised as healthy',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react']);await fs.unlink(file(f,'web/react/forms/instructions.md'));
  for(const cmd of ['doctor','validate','tree','list']) assert.match(cli(f.project,[cmd],1).stderr,/missing or locally modified/);
});
test('unknown files survive updates and removals, collisions fail',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react']);await fs.writeFile(file(f,'notes.txt'),'personal');await fs.writeFile(file(f,'web/react/forms/my-note.md'),'keep');
  cli(f.project,['remove','web/react']);assert.equal(await fs.readFile(file(f,'notes.txt'),'utf8'),'personal');assert.equal(await fs.readFile(file(f,'web/react/forms/my-note.md'),'utf8'),'keep');
  await fs.mkdir(file(f,'database/postgres/migrations'),{recursive:true});await fs.writeFile(file(f,'database/postgres/migrations/instructions.md'),'unowned');
  const before=await treeSnapshot(f.project);assert.match(cli(f.project,['install','database/postgres'],1).stderr,/Unknown file/);assert.deepEqual(await treeSnapshot(f.project),before);
});
test('unowned installation directory and host entry are preserved',async t=>{
  const f=await fixture(t);await fs.mkdir(file(f,''));await fs.writeFile(file(f,'notes.txt'),'mine');
  cli(f.project,['install','web/react'],1);assert.equal(await fs.readFile(file(f,'notes.txt'),'utf8'),'mine');
  const other=path.join(f.base,'host project');await fs.mkdir(path.join(other,'.agents/skills/progressive-skill-library'),{recursive:true});
  const bridge=path.join(other,'.agents/skills/progressive-skill-library/SKILL.md');await fs.writeFile(bridge,'existing skill');
  assert.match(cli(other,['install','web/react','--host','codex'],1).stderr,/Unowned host/);assert.equal(await fs.readFile(bridge,'utf8'),'existing skill');
});
test('Codex exposes exactly one bridge, leaves stay outside discovery, unrelated config survives',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.project,'AGENTS.md'),'User-owned instructions\n');
  cli(f.project,['install','web/react','--host','codex']);
  const host=await treeSnapshot(path.join(f.project,'.agents/skills'));
  assert.equal(Object.keys(host).filter(p=>p.endsWith('SKILL.md')).length,1);
  const bridge=path.join(f.project,'.agents/skills/progressive-skill-library/SKILL.md');
  const text=await fs.readFile(bridge,'utf8');assert.match(text,/^---\nname: progressive-skill-library\ndescription:/);assert.match(text,/\.skill-tree\/SKILL.md/);assert.ok(!text.includes('react.forms'));
  cli(f.project,['doctor']);cli(f.project,['install','database/postgres','--host','none']);await assert.rejects(fs.stat(bridge),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(f.project,'AGENTS.md'),'utf8'),'User-owned instructions\n');
});
test('separate customization survives regeneration and size warning never truncates map',async t=>{
  const f=await fixture(t);const custom=path.join(f.project,'.skill-tree-custom.md');await fs.writeFile(custom,'Prefer the narrowest applicable workflow.');
  const plan=JSON.parse(cli(f.project,['install','--all','--warn-bytes','1','--json']).stdout);assert.ok(plan.warnings.length);
  let router=await fs.readFile(file(f,'SKILL.md'),'utf8');for(const s of (await requireState(f.project)).lock.manifest.skills) assert.ok(router.includes(s.id));
  await fs.appendFile(custom,'\nReport unverified prerequisites.');cli(f.project,['doctor'],1);cli(f.project,['install','--all']);
  router=await fs.readFile(file(f,'SKILL.md'),'utf8');assert.match(router,/Report unverified/);assert.match(await fs.readFile(custom,'utf8'),/Prefer the narrowest/);cli(f.project,['doctor']);
});
test('source and installation directory symlink escapes are refused',async t=>{
  const f=await fixture(t);const outside=path.join(f.base,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.txt'),'untouched');
  const oldWeb=path.join(f.source,'web');await fs.rename(oldWeb,oldWeb+'-original');await fs.symlink(outside,oldWeb,process.platform==='win32'?'junction':'dir');
  assert.match(cli(f.project,['install','web/react','--source',f.source],1).stderr,/Symlink/);
  await fs.symlink(outside,file(f,''),process.platform==='win32'?'junction':'dir');assert.match(cli(f.project,['install','web/react'],1).stderr,/Symlink/);
  assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'untouched');
});
test('host directory symlink escape and internal unknown symlinks are refused',async t=>{
  const f=await fixture(t);const outside=path.join(f.base,'outside');await fs.mkdir(outside);
  await fs.symlink(outside,path.join(f.project,'.agents'),process.platform==='win32'?'junction':'dir');cli(f.project,['install','web/react','--host','codex'],1);assert.deepEqual(await fs.readdir(outside),[]);
  cli(f.project,['install','web/react']);await fs.symlink(outside,file(f,'unknown-link'),process.platform==='win32'?'junction':'dir');
  assert.match(cli(f.project,['remove','web/react'],1).stderr,/Symlink/);
});
test('path traversal and tampered lock file paths never escape installation',async t=>{
  const f=await fixture(t);await changeManifest(f.source,m=>m.resources[0].path='../sentinel');
  cli(f.project,['install','web/react','--source',f.source],1);assert.deepEqual(await fs.readdir(f.project),[]);
  cli(f.project,['install','web/react']);const p=file(f,'lock.json');const lock=JSON.parse(await fs.readFile(p,'utf8'));lock.files['../outside']='0'.repeat(64);await fs.writeFile(p,JSON.stringify(lock));
  assert.match(cli(f.project,['remove','web/react'],1).stderr,/Invalid managed file list/);
});
test('skill scripts are copied as inert content and never executed',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.source,'shared/scripts/json-keys.mjs'),"import {writeFileSync} from 'node:fs'; writeFileSync('EXECUTED','bad');");
  cli(f.project,['install','documentation/operations','--source',f.source]);
  await assert.rejects(fs.stat(path.join(f.project,'EXECUTED')),{code:'ENOENT'});assert.ok((await fs.stat(file(f,'shared/scripts/json-keys.mjs'))).isFile());
});
test('live mutation locks reject conflicting mutations and recovery',async t=>{
  const f=await fixture(t);const lock=path.join(f.project,'.skill-tree-mutation.lock');await fs.writeFile(lock,JSON.stringify({pid:process.pid}));
  const before=await treeSnapshot(f.project);assert.match(cli(f.project,['install','web/react'],1).stderr,/Conflicting mutation/);assert.match(cli(f.project,['recover'],1).stderr,/still alive/);assert.deepEqual(await treeSnapshot(f.project),before);
});
test('recovery guard serializes stale-lock reclamation and rejects ordinary mutations',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.project,'.skill-tree-recovery.lock'),JSON.stringify({pid:process.pid}));
  const before=await treeSnapshot(f.project);
  assert.match(cli(f.project,['recover'],1).stderr,/Recovery lock exists/);
  assert.match(cli(f.project,['install','web/react'],1).stderr,/Recovery lock exists/);
  assert.deepEqual(await treeSnapshot(f.project),before);
});
test('updates add branch descendants and move dependency paths by stable ID',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--source',f.source]);
  const oldDependency=path.join(f.source,'testing/unit/test-design');const moved=path.join(f.source,'testing/foundations/test-design');
  await fs.mkdir(path.dirname(moved),{recursive:true});await fs.rename(oldDependency,moved);
  await fs.mkdir(path.join(f.source,'web/react/effects'),{recursive:true});await fs.writeFile(path.join(f.source,'web/react/effects/instructions.md'),'# Effects\nInspect effect lifetime and cleanup.\n');
  await changeManifest(f.source,m=>{
    m.version='1.1.0';m.skills.find(s=>s.id==='testing.test-design').path='testing/foundations/test-design';
    m.skills.push({id:'react.effects',path:'web/react/effects',name:'Effects',description:'Inspect effect lifetime and cleanup',entry:'instructions.md',dependencies:[]});
  });
  const preview=JSON.parse(cli(f.project,['update','--source',f.source,'--dry-run','--json']).stdout);
  assert.ok(preview.additions.includes('web/react/effects/instructions.md'));assert.ok(preview.removals.includes('testing/unit/test-design/instructions.md'));
  cli(f.project,['update','--source',f.source]);const state=await requireState(f.project);
  assert.deepEqual(state.selection.selectors,['web/react']);assert.equal(state.lock.manifest.skills.find(s=>s.id==='testing.test-design').path,'testing/foundations/test-design');cli(f.project,['doctor']);
});
test('modified host bridge is preserved and stops mutation',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--host','codex']);
  const bridge=path.join(f.project,'.agents/skills/progressive-skill-library/SKILL.md');await fs.appendFile(bridge,'\nUser change.\n');
  const before=await treeSnapshot(f.project);assert.match(cli(f.project,['install','database/postgres'],1).stderr,/bridge was locally modified/);assert.deepEqual(await treeSnapshot(f.project),before);
});
test('unknown files prevent case aliases in shared directory names',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react']);
  await fs.mkdir(file(f,'Custom'));await fs.writeFile(file(f,'Custom/notes.txt'),'User notes');
  const input=path.join(f.base,'example.md');await fs.writeFile(input,'# Review\n\nReview a release.\n');
  const before=await treeSnapshot(f.project);
  assert.match(cli(f.project,['import',input,'--into','custom/review'],1).stderr,/Unknown file conflicts/);
  assert.deepEqual(await treeSnapshot(f.project),before);cli(f.project,['doctor']);
});
test('staging refuses a path with incorrect directory casing on Windows',{skip:process.platform!=='win32'},async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react']);await fs.mkdir(file(f,'Custom'));
  const input=path.join(f.base,'example.md');await fs.writeFile(input,'# Review\n\nReview a release.\n');
  const before=await treeSnapshot(f.project);
  assert.match(cli(f.project,['import',input,'--into','custom/review'],1).stderr,/Staged content does not match/);
  assert.deepEqual(await treeSnapshot(f.project),before);cli(f.project,['doctor']);
});
test('unknown prototype-named files cannot be claimed by a future resource',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--source',f.source]);await fs.writeFile(file(f,'constructor'),'user owned');
  await fs.writeFile(path.join(f.source,'constructor'),'new resource');
  await changeManifest(f.source,m=>{m.resources.push({id:'resource.extra',path:'constructor',name:'Extra',description:'Extra reference'});m.skills.find(s=>s.id==='react.forms').dependencies.push({kind:'resource',id:'resource.extra'});});
  const before=await treeSnapshot(f.project);assert.match(cli(f.project,['update','--source',f.source],1).stderr,/Unknown file/);assert.deepEqual(await treeSnapshot(f.project),before);
});
for(const phase of ['staged','backed-up','installed','integrated']) test(`commit failure at ${phase} rolls back root and bridge`,async t=>{
  const f=await fixture(t);await mutate(f.project,{command:'install',selectors:['web/react'],host:'codex'});
  const before=await treeSnapshot(f.project);const old=await requireState(f.project);const source=await loadSource();
  const plan=await planInstallation(f.project,source,{...old.selection,selectors:['web/react','database/postgres']},old);
  await assert.rejects(withMutation(f.project,()=>commit(f.project,plan,old,p=>{if(p===phase) throw new Error('injected failure');})),/injected failure/);
  assert.deepEqual(await treeSnapshot(f.project),before);cli(f.project,['doctor']);
});
test('first-install failure rolls back content and never publishes a partial router',async t=>{
  const f=await fixture(t);const source=await loadSource();
  const plan=await planInstallation(f.project,source,{schemaVersion:1,source:source.ref,selectors:['web/react'],host:'none',warnBytes:32768},null);
  await assert.rejects(withMutation(f.project,()=>commit(f.project,plan,null,p=>{if(p==='installed') throw new Error('injected');})),/injected/);
  assert.deepEqual(await fs.readdir(f.project),[]);
});
test('process interruption leaves recoverable journal; dry recovery writes nothing',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--host','codex']);const before=await treeSnapshot(f.project);
  const moduleUrl=name=>pathToFileURL(path.join(repository,'dist',name+'.js')).href;
  const script=`import {requireState} from ${JSON.stringify(moduleUrl('state'))};
import {loadSource} from ${JSON.stringify(moduleUrl('source'))};
import {planInstallation} from ${JSON.stringify(moduleUrl('planner'))};
import {withMutation,commit} from ${JSON.stringify(moduleUrl('filesystem'))};
const project=process.cwd();await withMutation(project,async()=>{const old=await requireState(project);const source=await loadSource();const plan=await planInstallation(project,source,{...old.selection,selectors:['web/react','database/postgres']},old);await commit(project,plan,old,p=>{if(p==='installed')process.exit(71);});});`;
  const crash=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:f.project,encoding:'utf8'});assert.equal(crash.status,71,crash.stderr);
  cli(f.project,['doctor'],1);const interrupted=await treeSnapshot(f.project);cli(f.project,['recover','--dry-run']);assert.deepEqual(await treeSnapshot(f.project),interrupted);
  cli(f.project,['recover']);assert.deepEqual(await treeSnapshot(f.project),before);cli(f.project,['doctor']);
});
