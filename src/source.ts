import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest, contentPaths } from './manifest.js';
import { regularRead, hash } from './paths.js';
import { json, type Source } from './model.js';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export async function loadSource(selector = 'bundled', cwd = process.cwd()): Promise<Source> {
  const bundled = selector === 'bundled';
  const directory = bundled ? path.join(packageRoot, 'library') : path.resolve(cwd, selector);
  const manifest = validateManifest(JSON.parse((await regularRead(directory, 'library.json')).toString('utf8')));
  const files = new Map<string, Buffer>();
  for (const file of contentPaths(manifest)) {
    try { files.set(file, await regularRead(directory, file)); }
    catch (e) { throw new Error(`Invalid source file ${file}: ${(e as Error).message}`); }
  }
  const revision = hash(json(manifest) + json([...files].map(([p,b]) => [p,hash(b)])));
  return { manifest, files, ref: { kind: bundled ? 'bundled' : 'local', location: bundled ? 'bundled' : directory, id: manifest.id, version: manifest.version, revision } };
}
