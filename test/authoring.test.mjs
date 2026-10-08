import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fixture,cli,treeSnapshot } from './helpers.mjs';
import { inspectImport } from '../dist/importer.js';
import { requireState } from '../dist/state.js';
import { withMutation,commit } from '../dist/filesystem.js';
import { author } from '../dist/authoring.js';

async function markdown(f,name='example.md',text='# Release review\n\nReview a release for missing changelog entries.\n') {
  const p=path.join(f.base,name);await fs.writeFile(p,text);return p;
}
async function external(f) {
  const dir=path.join(f.base,"external skill's folder");await fs.mkdir(path.join(dir,'references'),{recursive:true});await fs.mkdir(path.join(dir,'scripts'));
  await fs.writeFile(path.join(dir,'SKILL.md'),'---\nname: release-review\ndescription: >-\n  Review release notes\n  against a change list.\ncompatibility: Needs git\nlicense: MIT\nmetadata:\n  author: Example\n---\n# Review\n\nRead [cases](references/cases.md). Run `scripts/check.mjs` only if needed.\n');
  await fs.writeFile(path.join(dir,'references/cases.md'),'Return to [workflow](../SKILL.md#review).\n');
  await fs.writeFile(path.join(dir,'scripts/check.mjs'),"import {writeFileSync} from 'node:fs'; writeFileSync('EXECUTED','bad');\n");
  return dir;
}
test('plain Markdown imports, source edits sync, and metadata is searchable',async t=>{
  const f=await fixture(t);const input=await markdown(f);
  const result=JSON.parse(cli(f.project,['import',input,'--json']).stdout);
  assert.equal(result.compatibility.compatible,true);assert.equal(result.editFile,'.skill-tree/editable-library/custom/example/example.md');
  assert.equal((await requireState(f.project)).lock.manifest.skills[0].id,'custom.example');
  const editable=path.join(f.project,result.editFile);const installed=path.join(f.project,'.skill-tree/custom/example/example.md');
  await fs.appendFile(editable,'\nAlso check migration instructions.\n');
  assert.match(cli(f.project,['doctor']).stdout,/pending changes/);
  const before=await treeSnapshot(f.project);cli(f.project,['sync','--dry-run']);assert.deepEqual(await treeSnapshot(f.project),before);
  cli(f.project,['sync']);assert.match(await fs.readFile(installed,'utf8'),/migration instructions/);cli(f.project,['doctor']);
  assert.match(cli(f.project,['search','release']).stdout,/custom.example/);
  assert.equal(JSON.parse(cli(f.project,['sync','--json']).stdout).changed,false);
  assert.equal(await fs.readFile(input,'utf8'),'# Release review\n\nReview a release for missing changelog entries.\n');
});
test('check and import dry-run describe conversions without creating anything',async t=>{
  const f=await fixture(t);const input=await external(f);const before=await treeSnapshot(f.project);
  const report=JSON.parse(cli(f.project,['check',input,'--json']).stdout);
  assert.equal(report.compatible,true);assert.ok(report.conversions.some(c=>c.includes('Rename SKILL.md')));
  assert.deepEqual(report.skill.prerequisites,['Needs git']);assert.equal(report.resources.length,2);
  cli(f.project,['import',input,'--dry-run']);assert.deepEqual(await treeSnapshot(f.project),before);
});
test('Agent Skills folder imports resources, rewrites self links and preserves provenance without running scripts',async t=>{
  const f=await fixture(t);const input=await external(f);
  cli(f.project,['import',input,'--into','documentation/release','--id','docs.release']);
  const root=path.join(f.project,'.skill-tree/documentation/release');
  assert.match(await fs.readFile(path.join(root,'instructions.md'),'utf8'),/License: MIT/);
  assert.match(await fs.readFile(path.join(root,'references/cases.md'),'utf8'),/\.\.\/instructions.md#review/);
  await assert.rejects(fs.stat(path.join(root,'SKILL.md')),{code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(f.project,'EXECUTED')),{code:'ENOENT'});
  const state=await requireState(f.project);assert.equal(state.lock.manifest.resources.length,2);
  assert.ok(state.lock.manifest.skills[0].dependencies.every(d=>d.kind==='resource'));
});
test('customize forks the full source once, keeps installed selection and makes examples editable',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--host','codex']);
  const result=JSON.parse(cli(f.project,['customize','react.forms','--json']).stdout);
  assert.equal(result.sourceCreated,true);assert.deepEqual(result.selections,['web/react']);
  const original=await fs.readFile(path.join(f.project,'.skill-tree/web/react/forms/instructions.md'),'utf8');
  await fs.appendFile(path.join(f.project,result.editFile),'\nLocal team preference.\n');cli(f.project,['sync']);
  assert.equal(await fs.readFile(path.join(f.project,'.skill-tree/web/react/forms/instructions.md'),'utf8'),original+'\nLocal team preference.\n');
  cli(f.project,['install','database/postgres']);cli(f.project,['doctor']);
  assert.equal(JSON.parse(cli(f.project,['customize','react.forms','--json']).stdout).changed,false);
});
test('import into existing selections keeps paths, host integration and explicit prerequisites',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react','--host','codex']);const input=await markdown(f);
  cli(f.project,['import',input,'--requires','testing.test-design','--into','documentation/release']);
  const state=await requireState(f.project);assert.deepEqual(state.selection.selectors,['documentation/release','web/react']);assert.equal(state.selection.host,'codex');
  cli(f.project,['remove','web/react']);assert.ok((await requireState(f.project)).lock.manifest.skills.some(s=>s.id==='testing.test-design'));
  cli(f.project,['remove','documentation/release']);
  assert.ok((await fs.stat(path.join(f.project,'.skill-tree/editable-library/documentation/release/example.md'))).isFile());
  cli(f.project,['install','documentation/release']);cli(f.project,['doctor']);
});
test('duplicate imports cannot overwrite user edits and require unique IDs/paths',async t=>{
  const f=await fixture(t);const input=await markdown(f);cli(f.project,['import',input]);
  const before=await treeSnapshot(f.project);const error=cli(f.project,['import',input],1).stderr;
  assert.match(error,/Duplicate ID/);assert.match(error,/Fix:/);assert.deepEqual(await treeSnapshot(f.project),before);
  cli(f.project,['import',input,'--id','custom.other','--into','custom/other']);
});
test('pending source changes must be synced before import or customize',async t=>{
  const f=await fixture(t);const input=await markdown(f);cli(f.project,['import',input]);
  await fs.appendFile(path.join(f.project,'.skill-tree/editable-library/custom/example/example.md'),'\nEdited.\n');
  assert.match(cli(f.project,['import',input,'--into','custom/second'],1).stderr,/sync first/);
  assert.match(cli(f.project,['customize','custom.example'],1).stderr,/sync first/);
  cli(f.project,['sync']);
});
test('invalid editable metadata and missing source entries leave installed state usable',async t=>{
  const f=await fixture(t);const input=await markdown(f);cli(f.project,['import',input]);
  const installed=await fs.readFile(path.join(f.project,'.skill-tree/SKILL.md'),'utf8');
  const manifest=path.join(f.project,'.skill-tree/editable-library/library.json');const saved=await fs.readFile(manifest,'utf8');
  const m=JSON.parse(saved);m.skills[0].dependencies.push({kind:'skill',id:'missing'});await fs.writeFile(manifest,JSON.stringify(m));
  assert.match(cli(f.project,['sync'],1).stderr,/Unknown skill dependency/);assert.equal(await fs.readFile(path.join(f.project,'.skill-tree/SKILL.md'),'utf8'),installed);
  cli(f.project,['list']);await fs.writeFile(manifest,saved);await fs.unlink(path.join(f.project,'.skill-tree/editable-library/custom/example/example.md'));
  assert.match(cli(f.project,['sync'],1).stderr,/Invalid source file/);cli(f.project,['list']);
});
test('managed edits still conflict instead of being silently overwritten by sync',async t=>{
  const f=await fixture(t);const input=await markdown(f);cli(f.project,['import',input]);
  const installed=path.join(f.project,'.skill-tree/custom/example/example.md');await fs.appendFile(installed,'\nAccidental installed edit.\n');
  const before=await treeSnapshot(f.project);assert.match(cli(f.project,['sync'],1).stderr,/locally modified/);assert.deepEqual(await treeSnapshot(f.project),before);
});
test('unowned editable source directory is never adopted or overwritten',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react']);await fs.mkdir(path.join(f.project,'.skill-tree/editable-library'));
  await fs.writeFile(path.join(f.project,'.skill-tree/editable-library/notes.txt'),'user notes');const input=await markdown(f);const before=await treeSnapshot(f.project);
  assert.match(cli(f.project,['import',input],1).stderr,/Unowned/);assert.deepEqual(await treeSnapshot(f.project),before);
});
test('imports refuse unregistered editable files without overwriting user content',async t=>{
  const f=await fixture(t);const input=await markdown(f);cli(f.project,['import',input]);
  const target=path.join(f.project,'.skill-tree/editable-library/custom/second/example.md');
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'User notes that are not registered in the manifest.\n');
  const before=await treeSnapshot(f.project);
  for(const flags of [[],['--dry-run']]) {
    assert.match(cli(f.project,['import',input,'--into','custom/second',...flags],1).stderr,/Unowned editable file/);
    assert.deepEqual(await treeSnapshot(f.project),before);
  }
  cli(f.project,['doctor']);
});
test('imports refuse unregistered supporting resources even when the bytes match',async t=>{
  const f=await fixture(t);const initial=await markdown(f);cli(f.project,['import',initial]);const input=await external(f);
  const target=path.join(f.project,'.skill-tree/editable-library/custom/review/scripts/check.mjs');
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(input,'scripts/check.mjs'),target);
  const before=await treeSnapshot(f.project);
  assert.match(cli(f.project,['import',input,'--into','custom/review'],1).stderr,/Unowned editable file/);
  assert.deepEqual(await treeSnapshot(f.project),before);cli(f.project,['doctor']);
});
const badCases=[
  ['missing local link','# Test\n\nUse [guide](missing.md).\n','missing-reference'],
  ['escaping link','# Test\n\nUse [guide](../outside.md).\n','external-reference'],
  ['absolute link','# Test\n\nUse [guide](C:/outside.md).\n','external-reference'],
  ['reference-style link','# Test\n\nUse [guide][ref].\n\n[ref]: missing.md\n','missing-reference'],
  ['unclosed YAML','---\nname: test\n','frontmatter'],
  ['duplicate YAML','---\nname: test\nname: other\n---\nA task.\n','frontmatter'],
  ['YAML aliases','---\nname: &a test\ndescription: *a\n---\nA task.\n','frontmatter'],
  ['host tool rules','---\nname: test\ndescription: Test something\nallowed-tools: Bash\n---\nA task.\n','host-field'],
  ['missing description','# Heading only\n','description'],
  ['empty body','---\nname: test\ndescription: Test something\n---\n','empty-body']
];
for(const [name,body,code] of badCases) test(`compatibility reports ${name} and a repair`,async t=>{
  const f=await fixture(t);const input=await markdown(f,'example.md',body);const report=JSON.parse(cli(f.project,['check',input,'--json'],1).stdout);
  assert.equal(report.compatible,false);assert.ok(report.issues.some(i=>i.code===code && i.fix));
  cli(f.project,['import',input],1);assert.deepEqual(await fs.readdir(f.project),[]);
});
test('explicit metadata repairs a heading-only Markdown file',async t=>{
  const f=await fixture(t);const input=await markdown(f,'example.md','# Checklist\n');
  cli(f.project,['import',input,'--description','Review release completeness','--name','Release check','--id','docs.check','--into','docs/check']);cli(f.project,['doctor']);
});
test('nested skills, host config, unsafe resource names and rename collisions explain fixes',async t=>{
  const f=await fixture(t);const input=await external(f);
  await fs.mkdir(path.join(input,'nested'));await fs.writeFile(path.join(input,'nested/SKILL.md'),'Other workflow');
  await fs.mkdir(path.join(input,'agents'));await fs.writeFile(path.join(input,'agents/openai.yaml'),'name: host');
  await fs.writeFile(path.join(input,'bad name.txt'),'reference');await fs.writeFile(path.join(input,'instructions.md'),'collision');
  const {report}=await inspectImport(input);
  for(const code of ['nested-skill','host-config','path','rename-collision']) assert.ok(report.issues.some(i=>i.code===code),code);
});
test('unknown prerequisites, traversal destinations and reserved source namespace fail before mutation',async t=>{
  const f=await fixture(t);const input=await markdown(f);
  for(const args of [['--requires','missing'],['--into','../outside'],['--into','editable-library/recursive']]) {cli(f.project,['import',input,...args],1);assert.deepEqual(await fs.readdir(f.project),[]);}
});
test('symlinked input and resources are rejected without touching targets',async t=>{
  const f=await fixture(t);const input=await external(f);const outside=path.join(f.base,'outside');await fs.mkdir(outside);
  await fs.symlink(outside,path.join(input,'linked'),process.platform==='win32'?'junction':'dir');
  const report=JSON.parse(cli(f.project,['check',input,'--json'],1).stdout);assert.match(report.issues[0].message,/Symlink/);assert.deepEqual(await fs.readdir(f.project),[]);
});
test('ambiguous entries can be selected explicitly',async t=>{
  const f=await fixture(t);const input=path.join(f.base,'two entries');await fs.mkdir(input);
  await fs.writeFile(path.join(input,'one.md'),'# First\n\nReview the release.\n');await fs.writeFile(path.join(input,'two.md'),'# Second\n\nSupporting information.\n');
  cli(f.project,['check',input],1);cli(f.project,['import',input,'--entry','one.md']);assert.equal((await requireState(f.project)).lock.manifest.resources.length,1);
});
test('invalid UTF-8 supporting Markdown is rejected instead of being rewritten lossily',async t=>{
  const f=await fixture(t);const input=await external(f);await fs.writeFile(path.join(input,'references/cases.md'),Buffer.from([0xff,0xfe,0x00]));
  const report=JSON.parse(cli(f.project,['check',input,'--json'],1).stdout);assert.ok(report.issues.some(i=>i.code==='encoding'));
});
test('UTF-8 BOM in manually edited source manifest is accepted',async t=>{
  const f=await fixture(t);const input=await markdown(f);cli(f.project,['import',input]);
  const file=path.join(f.project,'.skill-tree/editable-library/library.json');await fs.writeFile(file,'\uFEFF'+await fs.readFile(file,'utf8'));
  cli(f.project,['sync']);cli(f.project,['doctor']);
});
test('authoring source and installed tree roll back together on commit failure',async t=>{
  const f=await fixture(t);cli(f.project,['install','web/react']);const input=await markdown(f);const before=await treeSnapshot(f.project);
  const {plan}=await author(f.project,'import',input,{dryRun:true});const previous=await requireState(f.project);
  await assert.rejects(withMutation(f.project,()=>commit(f.project,plan,previous,phase=>{if(phase==='installed')throw new Error('authoring failure');})),/authoring failure/);
  assert.deepEqual(await treeSnapshot(f.project),before);cli(f.project,['doctor']);
});
