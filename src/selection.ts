import type { Manifest, Skill } from './model.js';
import { canonical } from './paths.js';

export function select(m: Manifest, selector: string): Skill[] {
  if (selector === '*') return m.skills;
  canonical(selector);
  const matches = m.skills.filter(s => s.path === selector || s.path.startsWith(selector + '/'));
  if (!matches.length) throw new Error(`Invalid selector or empty branch: ${selector}. Use canonical branch/leaf paths; use --all for the whole library.`);
  return matches;
}
export function removeSelections(current: string[], removing: string[]): string[] {
  if (!removing.length) throw new Error('remove needs at least one explicit selection (or --all).');
  for (const s of removing) if (!current.includes(s)) {
    const covering = current.find(p => p === '*' || s.startsWith(p + '/'));
    throw new Error(covering ? `${s} is included by explicit selection ${covering}; remove that selection first. Subtree exclusions are not supported.` : `${s} is not an explicit selection. See list/explain for dependency reasons.`);
  }
  return current.filter(s => !removing.includes(s));
}
