import { canonical } from './paths.js';
import type { Manifest, Skill } from './model.js';

function object(x: unknown, label: string): asserts x is Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`${label} must be an object`);
}
function text(x: unknown, label: string): asserts x is string {
  if (typeof x !== 'string' || !x.trim() || x.length > 1000 || /[\r\n\x00-\x1f]/.test(x)) throw new Error(`${label} must be a nonempty single-line string (max 1000 characters)`);
}
function keys(x: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(x)) if (!allowed.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}
export function validateManifest(value: unknown): Manifest {
  object(value, 'Manifest');
  keys(value, ['schemaVersion','id','version','name','description','branches','skills','resources'], 'manifest');
  if (value.schemaVersion !== 1) throw new Error(`Unsupported manifest schema version: ${value.schemaVersion}`);
  for (const k of ['id','version','name','description']) text(value[k], k);
  for (const k of ['branches','skills','resources']) if (!Array.isArray(value[k])) throw new Error(`${k} must be an array`);
  const ids = new Set<string>(); const paths = new Map<string, string>(); const files: string[] = [];
  const reserve = (p: unknown, kind: string): void => {
    canonical(p);
    if (['library.json','skill.md','selection.json','lock.json','router-template.md','navigation.md'].includes(p.split('/')[0]!.toLowerCase())) throw new Error(`Reserved path: ${p}`);
    const lower = p.toLowerCase();
    if (paths.has(lower)) throw new Error(`Duplicate path: ${p}`);
    paths.set(lower, kind);
  };
  for (const b of value.branches as unknown[]) {
    object(b, 'Branch'); keys(b, ['path','description'], 'branch'); reserve(b.path, 'branch');
    if (b.description !== undefined) text(b.description, 'branch description');
  }
  for (const [kind, entries] of [['skill', value.skills], ['resource', value.resources]] as const) {
    for (const e of entries as unknown[]) {
      object(e, kind);
      keys(e, kind === 'skill' ? ['id','path','name','description','entry','dependencies','aliases','tags','prerequisites'] : ['id','path','name','description'], kind);
      for (const k of ['id','name','description']) text(e[k], `${kind}.${k}`);
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(e.id as string)) throw new Error(`Invalid stable ID: ${e.id}`);
      if (ids.has(e.id as string)) throw new Error(`Duplicate ID: ${e.id}`);
      ids.add(e.id as string); reserve(e.path, kind);
      if (kind === 'skill') {
        canonical(e.entry);
        if (e.entry.split('/').some(p => p.toLowerCase() === 'skill.md')) throw new Error('Internal entries must not be named SKILL.md');
        files.push(`${e.path}/${e.entry}`);
        if (!Array.isArray(e.dependencies)) throw new Error(`dependencies must be an array: ${e.id}`);
        const deps = new Set();
        for (const d of e.dependencies) {
          object(d, 'Dependency'); keys(d, ['kind','id'], 'dependency'); text(d.id, 'dependency ID');
          if (d.kind !== 'skill' && d.kind !== 'resource') throw new Error(`Unknown dependency kind: ${d.kind}`);
          if (deps.has(d.id)) throw new Error(`Duplicate dependency: ${d.id}`); deps.add(d.id);
        }
        for (const field of ['aliases','tags','prerequisites']) if (e[field] !== undefined) {
          if (!Array.isArray(e[field])) throw new Error(`${field} must be an array`);
          for (const item of e[field] as unknown[]) text(item, field);
        }
      } else {
        if ((e.path as string).split('/').some(p => p.toLowerCase() === 'skill.md')) throw new Error('Resources cannot expose SKILL.md');
        files.push(e.path as string);
      }
    }
  }
  const m = value as unknown as Manifest;
  const spelling = new Map<string,string>();
  for (const p of [...m.branches.map(b => b.path), ...m.skills.map(s => s.path), ...files]) {
    const parts = p.split('/');
    for (let i=1;i<=parts.length;i++) {
      const prefix = parts.slice(0,i).join('/'); const prior = spelling.get(prefix.toLowerCase());
      if (prior && prior !== prefix) throw new Error(`Case-insensitive path collision: ${prior} and ${prefix}`);
      spelling.set(prefix.toLowerCase(),prefix);
    }
  }
  const fileSet = new Set<string>();
  for (const file of files) {
    canonical(file); const lower = file.toLowerCase();
    if (fileSet.has(lower)) throw new Error(`Duplicate managed file: ${file}`); fileSet.add(lower);
    if (paths.has(lower) && paths.get(lower) !== 'resource') throw new Error(`File/directory collision: ${file}`);
  }
  for (const p of [...paths.keys(), ...fileSet]) {
    const parts = p.split('/'); parts.pop();
    while (parts.length) {
      const parent = parts.join('/');
      if (fileSet.has(parent)) throw new Error(`File/directory collision: ${parent}`);
      if (paths.get(parent) === 'skill' && paths.has(p) && paths.get(p) !== 'resource') throw new Error(`Skills must be leaves: ${p}`);
      parts.pop();
    }
  }
  const skills = new Map(m.skills.map(s => [s.id, s])); const resources = new Set(m.resources.map(r => r.id));
  for (const s of m.skills) for (const d of s.dependencies) {
    if (!(d.kind === 'skill' ? skills.has(d.id) : resources.has(d.id))) throw new Error(`Unknown ${d.kind} dependency ${d.id} in ${s.id}`);
  }
  const visiting = new Set<string>(); const done = new Set<string>();
  function visit(s: Skill): void {
    if (visiting.has(s.id)) throw new Error(`Dependency cycle at ${s.id}`);
    if (done.has(s.id)) return;
    visiting.add(s.id);
    for (const d of s.dependencies) if (d.kind === 'skill') visit(skills.get(d.id)!);
    visiting.delete(s.id); done.add(s.id);
  }
  m.skills.forEach(visit);
  return m;
}
export function contentPaths(m: Manifest): string[] {
  return [...m.skills.map(s => `${s.path}/${s.entry}`), ...m.resources.map(r => r.path)].sort();
}
