import { select } from './selection.js';
import { compare, type Manifest, type Resolved, type Skill } from './model.js';

export function resolve(m: Manifest, selectors: string[]): Resolved {
  const skills = new Map(m.skills.map(s => [s.id, s]));
  const included = new Set<string>(); const resources = new Set<string>();
  const reasons: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  const addReason = (id: string, reason: string): void => { (reasons[id] ??= []).push(reason); };
  function visit(s: Skill): void {
    if (included.has(s.id)) return; included.add(s.id);
    for (const d of s.dependencies) {
      addReason(d.id, `required ${d.kind} by ${s.id}`);
      if (d.kind === 'skill') visit(skills.get(d.id)!); else resources.add(d.id);
    }
  }
  for (const selector of [...selectors].sort(compare)) for (const s of select(m, selector)) {
    addReason(s.id, `selection ${selector}`); visit(s);
  }
  const leaves = m.skills.filter(s => included.has(s.id)).sort((a,b) => compare(a.path,b.path));
  const assets = m.resources.filter(r => resources.has(r.id)).sort((a,b) => compare(a.path,b.path));
  const allPaths = [...leaves.map(s => s.path), ...assets.map(r => r.path)];
  for (const id of Object.keys(reasons)) reasons[id] = [...new Set(reasons[id])].sort(compare);
  return { manifest: { ...m, skills: leaves, resources: assets, branches: m.branches.filter(b => allPaths.some(p => p.startsWith(b.path + '/'))).sort((a,b) => compare(a.path,b.path)) }, reasons: Object.fromEntries(Object.entries(reasons).sort(([a],[b]) => compare(a,b))) };
}
