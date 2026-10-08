import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { BRIDGE, ROOT, json, type State, type Lock, type Selection } from './model.js';
import { contentPaths, validateManifest } from './manifest.js';
import { exists, hash, regularRead, safePath, snapshot } from './paths.js';
import { resolve } from './dependencies.js';
import { generateRouter } from './router.js';
import { codexBridge } from './host.js';

export async function readState(project: string, metadataOnly = false): Promise<State | null> {
  const root = await safePath(project, ROOT);
  if (!await exists(root)) return null;
  const files = metadataOnly ? new Map<string,Buffer>() : await snapshot(root);
  if (metadataOnly) for (const p of ['lock.json','selection.json','router-template.md','navigation.md','SKILL.md']) {
    if (await exists(await safePath(root,p))) files.set(p,await regularRead(root,p));
  }
  if (!files.has('lock.json') || !files.has('selection.json')) throw new Error('Unmanaged or incomplete .skill-tree directory. Move it aside before installing; no files were changed.');
  let lock: Lock; let selection: Selection;
  try {
    lock = JSON.parse(files.get('lock.json')!.toString()) as Lock;
    selection = JSON.parse(files.get('selection.json')!.toString()) as Selection;
  } catch { throw new Error('Invalid installed JSON state. Restore selection.json/lock.json from a trusted backup.'); }
  if (lock?.schemaVersion !== 1 || lock.generatorVersion !== 1 || selection?.schemaVersion !== 1) throw new Error('Unsupported installed schema or router-generator version');
  const m = validateManifest(lock.manifest);
  if (!selection.source || !['bundled','local'].includes(selection.source.kind) || typeof selection.source.location !== 'string' || !selection.source.location ||
    selection.source.id !== m.id || selection.source.version !== m.version || !/^[a-f0-9]{64}$/.test(selection.source.revision) || json(selection.source) !== json(lock.source)) throw new Error('Invalid or inconsistent source identity in installed state');
  if (!Array.isArray(selection.selectors) || selection.selectors.some(s => typeof s !== 'string') || new Set(selection.selectors).size !== selection.selectors.length ||
    !['none','codex'].includes(selection.host) || !Number.isSafeInteger(selection.warnBytes) || selection.warnBytes < 1) throw new Error('Invalid selection state');
  const resolved = resolve(m, selection.selectors);
  if (json(resolved.manifest) !== json(m) || json(resolved.reasons) !== json(lock.reasons)) throw new Error('Inconsistent installed dependency closure or installation reasons');
  const expected = [...contentPaths(m), 'SKILL.md','selection.json','router-template.md','navigation.md'].sort();
  if (!lock.files || json(Object.keys(lock.files).sort()) !== json(expected)) throw new Error('Invalid managed file list in lock.json');
  for (const file of expected) {
    if (metadataOnly && !files.has(file) && contentPaths(m).includes(file)) {
      const p = await safePath(root,file);
      if (!await exists(p) || !(await lstat(p)).isFile()) throw new Error(`Managed file missing: ${ROOT}/${file}`);
      continue; // Metadata search never opens instruction or resource bodies. Doctor verifies hashes.
    }
    const bytes = files.get(file);
    if (!bytes || hash(bytes) !== lock.files[file]) throw new Error(`Managed file missing or locally modified: ${ROOT}/${file}. Save your edits elsewhere, then restore the locked file before retrying.`);
  }
  const router = generateRouter(m, files.get('router-template.md')!.toString(), files.get('navigation.md')!.toString());
  if (router !== files.get('SKILL.md')!.toString()) throw new Error('Router is inconsistent with installed metadata');
  let bridge: Buffer | null = null;
  if (selection.host === 'codex') {
    if (lock.integration?.path !== BRIDGE || lock.integration.checksum !== hash(codexBridge(m))) throw new Error('Invalid host integration state');
    try { bridge = await regularRead(project, BRIDGE); }
    catch (e) { throw new Error(`Codex bridge is missing or unsafe: ${(e as Error).message}`); }
    if (hash(bridge) !== lock.integration.checksum) throw new Error('Codex bridge was locally modified. Restore it from backup before retrying.');
  } else if (lock.integration !== null) throw new Error('Unexpected host integration');
  return { selection, lock, files, bridge };
}
export async function requireState(project: string, metadataOnly = false): Promise<State> {
  const state = await readState(project,metadataOnly);
  if (!state) throw new Error(`No installation at ${path.join(project, ROOT)}. Run skill-tree install <selector> first.`);
  return state;
}
