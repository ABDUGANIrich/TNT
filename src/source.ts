import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest, contentPaths } from './manifest.js';
import { regularRead, hash } from './paths.js';
import { json, type Manifest, type Source, type SourceRef } from './model.js';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export async function loadSource(selector = 'bundled', cwd = process.cwd()): Promise<Source> {
  const bundled = selector === 'bundled';
  const directory = bundled ? path.join(packageRoot, 'library') : path.resolve(cwd, selector);
  const manifest = validateManifest(JSON.parse((await regularRead(directory, 'library.json')).toString('utf8').replace(/^\uFEFF/,'')));
  const files = new Map<string, Buffer>();
  for (const file of contentPaths(manifest)) {
    try { files.set(file, await regularRead(directory, file)); }
    catch (e) { throw new Error(`Invalid source file ${file}: ${(e as Error).message}`); }
  }
  return sourceSnapshot(manifest,files,{kind:bundled ? 'bundled' : 'local',location:bundled ? 'bundled' : directory});
}
export function sourceSnapshot(manifest: Manifest, files: Map<string,Buffer>, locator: Pick<SourceRef,'kind'|'location'>): Source {
  validateManifest(manifest);
  const declared = new Map<string,Buffer>();
  for (const p of contentPaths(manifest)) {
    const bytes = files.get(p); if (!bytes) throw new Error(`Missing source file: ${p}`); declared.set(p,bytes);
  }
  const revision = hash(json(manifest) + json([...declared].map(([p,b]) => [p,hash(b)])));
  return {manifest,files:declared,ref:{...locator,id:manifest.id,version:manifest.version,revision}};
}
