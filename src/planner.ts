import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BRIDGE, CUSTOM, json, type Plan, type Selection, type Source, type State } from './model.js';
import { resolve } from './dependencies.js';
import { contentPaths } from './manifest.js';
import { codexBridge } from './host.js';
import { generateRouter } from './router.js';
import { exists, hash, pathsConflict, regularRead, safePath } from './paths.js';
import { packageRoot } from './source.js';

export async function customization(project: string): Promise<Buffer> {
  return await exists(await safePath(project, CUSTOM)) ? regularRead(project, CUSTOM) : Buffer.from('');
}
export async function planInstallation(project: string, source: Source, selection: Selection, previous: State | null): Promise<Plan> {
  const { manifest, reasons } = resolve(source.manifest, selection.selectors);
  const files = new Map<string, Buffer>();
  for (const p of contentPaths(manifest)) {
    const bytes = source.files.get(p); if (!bytes) throw new Error(`Missing desired source content: ${p}`); files.set(p, bytes);
  }
  const template = await readFile(path.join(packageRoot, 'templates/router.md'));
  const custom = await customization(project);
  const router = Buffer.from(generateRouter(manifest, template.toString(), custom.toString()));
  files.set('router-template.md', template); files.set('navigation.md', custom);
  files.set('SKILL.md', router); files.set('selection.json', Buffer.from(json(selection)));
  const bridge = selection.host === 'codex' ? codexBridge(manifest) : null;
  if (bridge || previous?.bridge) {
    const bridgePath = await safePath(project, BRIDGE);
    if (await exists(bridgePath) && !previous?.bridge) throw new Error(`Unowned host entry exists at ${BRIDGE}; move it aside or choose --host none.`);
  }
  const lock = { schemaVersion: 1 as const, generatorVersion: 1 as const, source: source.ref, manifest, reasons,
    files: Object.fromEntries([...files].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([p,b]) => [p,hash(b)])),
    integration: bridge ? { path: BRIDGE, checksum: hash(bridge) } : null };
  files.set('lock.json', Buffer.from(json(lock)));
  const additions: string[] = []; const updates: string[] = []; const removals: string[] = [];
  for (const [p,b] of files) {
    if (previous?.files.has(p) && p !== 'lock.json' && !Object.hasOwn(previous.lock.files,p)) throw new Error(`Unknown file would be overwritten: ${p}`);
    if (!previous?.files.has(p)) additions.push(p);
    else if (!b.equals(previous.files.get(p)!)) updates.push(p);
  }
  if (previous) for (const p of Object.keys(previous.lock.files)) if (!files.has(p)) removals.push(p);
  // Catch collisions with unknown files, including file/directory and case-folded conflicts.
  const desiredPaths = [...files.keys()];
  if (previous) for (const p of previous.files.keys()) {
    if (p === 'lock.json' || Object.hasOwn(previous.lock.files,p)) continue;
    if (desiredPaths.some(d => pathsConflict(d,p))) throw new Error(`Unknown file conflicts with desired content: ${p}`);
  }
  const integration = bridge?.equals(previous?.bridge ?? Buffer.from('')) || (!bridge && !previous?.bridge) ? 'unchanged' : bridge ? (previous?.bridge ? 'update Codex bridge' : 'add Codex bridge') : 'remove Codex bridge';
  return { selection, lock, files, bridge, additions: additions.sort(), updates: updates.sort(), removals: removals.sort(),
    dependencies: Object.entries(reasons).filter(([,rs]) => !rs.some(r => r.startsWith('selection '))).map(([id,rs]) => ({id, reasons:rs})),
    integration, routerBytes: router.length, warnings: router.length > selection.warnBytes ? [`Router is ${router.length} bytes, above the ${selection.warnBytes}-byte threshold; map is complete and has not been truncated.`] : [],
    changed: !!(additions.length || updates.length || removals.length || integration !== 'unchanged') };
}
