import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { validateManifest } from '../dist/manifest.js';
import { loadSource } from '../dist/source.js';
import { resolve } from '../dist/dependencies.js';
import { generateRouter } from '../dist/router.js';
import { canonical } from '../dist/paths.js';
import { fixture, repository } from './helpers.mjs';

const source=await loadSource();
const manifest=source.manifest;
const template=await fs.readFile(path.join(repository,'templates/router.md'),'utf8');
test('branch resolution includes only descendants, explicit prerequisites and resources',()=>{
  const r=resolve(manifest,['web/react']);
  assert.deepEqual(r.manifest.skills.map(s=>s.id),['testing.test-design','react.forms','react.performance','react.state']);
  assert.deepEqual(r.manifest.resources.map(s=>s.id),['resource.form-matrix','resource.measurements']);
  assert.deepEqual(r.reasons['testing.test-design'],['required skill by react.forms']);
});
test('overlapping selections retain each explicit reason and shared dependency',()=>{
  const r=resolve(manifest,['web/react','web/react/forms','testing/integration']);
  assert.deepEqual(r.reasons['react.forms'],['selection web/react','selection web/react/forms']);
  assert.deepEqual(r.reasons['testing.test-design'],['required skill by react.forms','required skill by testing.contracts']);
});
test('router is deterministic for equivalent selection order and includes every path',()=>{
  const a=resolve(manifest,['web/react','database/postgres']);
  const b=resolve(manifest,['database/postgres','web/react']);
  const router=generateRouter(a.manifest,template);
  assert.equal(router,generateRouter(b.manifest,template));
  for(const s of a.manifest.skills) assert.ok(router.includes(`${s.path}/${s.entry}`));
  assert.ok(!router.includes('vue.components'));
  assert.match(router,/READ prerequisite testing.test-design/);
  assert.match(router,/resource on demand resource.form-matrix/);
  assert.ok(!router.includes(repository));
});
const invalid = [
  ['unsupported version',m=>m.schemaVersion=2,/schema version/],
  ['duplicate IDs',m=>m.skills[1].id=m.skills[0].id,/Duplicate ID/],
  ['duplicate paths',m=>m.skills[1].path=m.skills[0].path,/Duplicate path/],
  ['case aliases',m=>m.skills[1].path='Web/react/performance',/Case-insensitive/],
  ['unknown dependency',m=>m.skills[0].dependencies[0].id='missing',/Unknown skill dependency/],
  ['wrong dependency kind',m=>m.skills[0].dependencies[0].kind='resource',/Unknown resource dependency/],
  ['cycles',m=>m.skills.find(s=>s.id==='testing.test-design').dependencies=[{kind:'skill',id:'react.forms'}],/cycle/],
  ['entry traversal',m=>m.skills[0].entry='../outside.md',/Invalid portable/],
  ['reserved file',m=>m.resources[0].path='lock.json',/Reserved path/],
  ['source manifest as resource',m=>m.resources[0].path='library.json',/Reserved path/],
  ['nested skills',m=>m.skills[1].path='web/react/forms/nested',/must be leaves/],
  ['entry as resource',m=>m.resources[0].path='web/react/forms/instructions.md',/Duplicate managed file/],
  ['file as branch',m=>m.branches.push({path:'web/react/forms/instructions.md'}),/collision|leaves/],
  ['host leaf discovery',m=>m.skills[0].entry='SKILL.md',/must not be named/],
  ['resource discovery',m=>m.resources[0].path='shared/SKILL.md',/cannot expose/],
  ['unknown fields',m=>m.skills[0].dependancies=[],/Unknown skill field/],
  ['malformed metadata',m=>m.skills[0].description='line\nbreak',/single-line/],
  ['malformed list',m=>m.skills[0].tags='react',/must be an array/],
  ['missing dependencies field',m=>delete m.skills[0].dependencies,/must be an array/]
];
for(const [name,edit,error] of invalid) test(`manifest rejects ${name}`,()=>{const m=structuredClone(manifest);edit(m);assert.throws(()=>validateManifest(m),error);});
test('portable paths reject escapes, device names, backslashes and streams',()=>{
  for(const p of ['../x','/x','C:/x','a\\b','a//b','a/./b','con/file','aux.md','x:y','x.','a/..','a/COM1.txt']) assert.throws(()=>canonical(p),/Invalid portable/);
  canonical('web/react/forms');
});
test('invalid selectors do not silently select all',()=>{
  for(const p of ['','no-such-branch','../web','react.forms']) assert.throws(()=>resolve(manifest,[p]));
});
test('source loading rejects missing entry files, including unselected leaves',async t=>{
  const f=await fixture(t);await fs.unlink(path.join(f.source,'web/vue/components/instructions.md'));
  await assert.rejects(loadSource(f.source),/Invalid source file/);
});
test('unlisted ancestor files do not affect source revision',async t=>{
  const f=await fixture(t);const a=await loadSource(f.source);
  await fs.writeFile(path.join(f.source,'web','unlisted-secret.txt'),'must never be installed');
  const b=await loadSource(f.source);assert.equal(a.ref.revision,b.ref.revision);assert.ok(!b.files.has('web/unlisted-secret.txt'));
});
