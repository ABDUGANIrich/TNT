import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const hash = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
export function canonical(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 220 || value.split('/').some(p =>
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) {
    throw new Error(`Invalid portable relative path: ${String(value)}`);
  }
}
export async function exists(file: string): Promise<boolean> {
  try { await fs.lstat(file); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; }
}
// Check every existing component, including the root. Never follow symlinks/junctions.
export async function safePath(root: string, relative = ''): Promise<string> {
  if (relative && (relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..' || /[:\x00]/.test(p)))) throw new Error(`Unsafe relative path: ${relative}`);
  const target = path.resolve(root, ...relative.split('/'));
  const absoluteRoot = path.resolve(root);
  if (target !== absoluteRoot && !target.startsWith(absoluteRoot + path.sep)) throw new Error('Path escapes root');
  const parsed = path.parse(target);
  let cursor = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error(`Symlink/junction refused: ${cursor}`); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  return target;
}
export async function regularRead(root: string, relative: string): Promise<Buffer> {
  const target = await safePath(root, relative);
  const stat = await fs.lstat(target);
  if (!stat.isFile()) throw new Error(`Expected regular file: ${relative}`);
  return fs.readFile(target);
}
export async function snapshot(root: string): Promise<Map<string, Buffer>> {
  await safePath(root);
  const result = new Map<string, Buffer>();
  if (!await exists(root)) return result;
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlink/junction refused: ${rel}`);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel + '/');
      else if (entry.isFile()) result.set(rel, await fs.readFile(path.join(dir, entry.name)));
      else throw new Error(`Unsupported filesystem entry: ${rel}`);
    }
  }
  await walk(root, '');
  return result;
}
