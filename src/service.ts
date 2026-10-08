import { type Plan, type Selection, type Source } from './model.js';
import { assertIdle, commit, withMutation } from './filesystem.js';
import { readState } from './state.js';
import { loadSource } from './source.js';
import { removeSelections } from './selection.js';
import { planInstallation } from './planner.js';

export interface MutationOptions {
  command: 'install' | 'remove' | 'update'; selectors: string[]; all?: boolean;
  source?: string; host?: 'codex' | 'none'; warnBytes?: number; dryRun?: boolean;
}
export async function mutate(project: string, options: MutationOptions): Promise<Plan> {
  const action = async (): Promise<Plan> => {
    const previous = await readState(project);
    let source: Source;
    if (options.command !== 'install' && !previous) throw new Error('No installation; run install first.');
    if (options.command === 'update' && !options.source) throw new Error('update requires --source <directory|bundled> identifying the target revision. Bundled updates require obtaining a newer npm package first.');
    if (options.command === 'remove') {
      source = {manifest:previous!.lock.manifest,ref:previous!.lock.source,files:previous!.files};
    } else {
      source = await loadSource(options.source ?? previous?.selection.source.location ?? 'bundled', project);
      if (previous && source.ref.id !== previous.selection.source.id) throw new Error('Only one source library per installation; source identity differs. Use a separate project.');
      if (previous && options.command === 'install' && source.ref.revision !== previous.selection.source.revision) throw new Error('Source revision changed. Run update --source <directory|bundled> explicitly before adding selections.');
    }
    let selectors = previous?.selection.selectors ?? [];
    if (options.command === 'install') {
      if (!options.selectors.length && !options.all) throw new Error('install needs one or more selectors, or explicit --all.');
      selectors = [...new Set([...selectors, ...(options.all ? ['*'] : options.selectors)])].sort();
    } else if (options.command === 'remove') selectors = options.all ? [] : removeSelections(selectors,options.selectors);
    const selection: Selection = {schemaVersion:1,source:source.ref,selectors,host:options.host ?? previous?.selection.host ?? 'none',warnBytes:options.warnBytes ?? previous?.selection.warnBytes ?? 32768};
    const plan = await planInstallation(project,source,selection,previous);
    if (!options.dryRun) await commit(project,plan,previous);
    return plan;
  };
  if (options.dryRun) { await assertIdle(project); return action(); }
  return withMutation(project,action);
}
