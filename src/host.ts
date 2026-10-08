import type { Manifest } from './model.js';

export function codexBridge(m: Manifest): Buffer {
  const areas = [...new Set(m.skills.map(s => s.path.split('/')[0]))].sort().join(', ') || 'an empty installed library';
  return Buffer.from(`---\nname: progressive-skill-library\ndescription: ${JSON.stringify(`Find project workflows for ${areas}. Use when a task may match the installed local skill library.`)}\n---\n\nRead the canonical router at \`.skill-tree/SKILL.md\` from the project directory\ncontaining this .agents folder (../../../.skill-tree/SKILL.md relative to this skill directory).\nSelect relevant leaves from that map and open them directly. This bridge contains no leaf catalog.\nFollow the user request and host instruction hierarchy.\n`);
}
