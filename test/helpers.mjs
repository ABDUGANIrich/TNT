import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

export const repository = fileURLToPath(new URL('../', import.meta.url));
export async function fixture(t) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const base = await fs.mkdtemp(path.join(tempRoot, "skill-tree test's "));
  t.after(async () => {
    if (!path.resolve(base).startsWith(tempRoot + path.sep) || !path.basename(base).startsWith("skill-tree test's ")) throw new Error('Unsafe test cleanup path');
    await fs.rm(base,{recursive:true,force:true});
  });
  const project = path.join(base,"user's project"); const source = path.join(base,'custom source');
  await fs.mkdir(project); await fs.cp(path.join(repository,'library'),source,{recursive:true});
  return {base,project,source};
}
export function cli(project,args,expected=0) {
  const result = spawnSync(process.execPath,[path.join(repository,'dist/cli.js'),...args],{cwd:project,encoding:'utf8'});
  assert.equal(result.status,expected,`${args.join(' ')}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  return result;
}
export async function changeManifest(source,update) {
  const file=path.join(source,'library.json'); const m=JSON.parse(await fs.readFile(file,'utf8')); update(m); await fs.writeFile(file,JSON.stringify(m,null,2)+'\n');
}
export async function treeSnapshot(root) {
  const result={};
  async function walk(dir,prefix='') {
    for(const e of await fs.readdir(dir,{withFileTypes:true})) {
      const rel=prefix+e.name; const p=path.join(dir,e.name);
      if(e.isDirectory()) { result[rel+'/']='directory'; await walk(p,rel+'/'); }
      else if(e.isSymbolicLink()) result[rel]='symlink:'+await fs.readlink(p);
      else result[rel]=(await fs.readFile(p)).toString('base64');
    }
  }
  await walk(root); return result;
}
