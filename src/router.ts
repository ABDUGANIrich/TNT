import { compare, type Manifest } from './model.js';

export function hierarchy(m: Manifest): string {
  const lines: string[] = []; const emitted = new Set<string>();
  const descriptions = new Map(m.branches.map(b => [b.path,b.description]));
  const rows = [
    ...m.skills.map(s => ({path: `${s.path}/${s.entry}`, label: `${s.description} [skill: ${s.id}]`})),
    ...m.resources.map(r => ({path: r.path, label: `${r.description} [resource: ${r.id}; read only when needed]`}))
  ].sort((a,b) => compare(a.path,b.path));
  for (const row of rows) {
    const parts = row.path.split('/');
    for (let i=0;i<parts.length-1;i++) {
      const p = parts.slice(0,i+1).join('/');
      if (!emitted.has(p)) { lines.push(`${'  '.repeat(i)}${parts[i]}/${descriptions.get(p) ? ' — ' + descriptions.get(p) : ''}`); emitted.add(p); }
    }
    lines.push(`${'  '.repeat(parts.length-1)}${parts.at(-1)} — ${row.label}`);
  }
  return lines.join('\n') || '(no installed skills)';
}
export function generateRouter(m: Manifest, template: string, custom = ''): string {
  const skills = new Map(m.skills.map(s => [s.id,s])); const resources = new Map(m.resources.map(r => [r.id,r]));
  const dependencies = [...m.skills].sort((a,b) => compare(a.path,b.path)).map(s => {
    const links = [...s.dependencies].sort((a,b) => compare(a.id,b.id)).map(d => {
      const p = d.kind === 'skill' ? `${skills.get(d.id)!.path}/${skills.get(d.id)!.entry}` : resources.get(d.id)!.path;
      return `${d.kind === 'skill' ? 'READ prerequisite' : 'resource on demand'} ${d.id}: \`${p}\``;
    });
    const env = s.prerequisites?.length ? `; environment/tools: ${s.prerequisites.join(', ')}` : '';
    return `- ${s.id}: \`${s.path}/${s.entry}\`${links.length ? '; ' + links.join('; ') : ''}${env}`;
  });
  return `# ${m.name}\n\n${m.description}\n\n${template.trim()}\n\n## Installed tree\n\n\`\`\`text\n${hierarchy(m)}\n\`\`\`\n\n## Direct paths and prerequisites\n\n${dependencies.join('\n') || '(none)'}\n${custom.trim() ? '\n## User navigation preferences\n\n' + custom.trim() + '\n' : ''}`;
}
