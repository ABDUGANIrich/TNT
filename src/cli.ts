#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { json, type Plan } from './model.js';
import { loadSource, packageRoot } from './source.js';
import { mutate } from './service.js';
import { requireState } from './state.js';
import { hierarchy } from './router.js';
import { assertIdle, recover, withMutation } from './filesystem.js';
import { customization } from './planner.js';

const help = `Progressive Skill Library — skill-tree

Usage: skill-tree <command> [selectors] [options]
  install <branch|leaf>...  Add explicit selections and required dependencies
  install --all            Explicitly select the entire library
  remove <selection>...    Remove exact explicit selections; recompute dependencies
  remove --all             Remove all selections (keep metadata and unknown files)
  update --source <path|bundled>  Reconcile selections against an explicit revision
  list | tree | stats      Inspect installed content
  search <query>           Search installed metadata, not instruction bodies
  explain <skill-id>       Show paths, prerequisites and installation reasons
  validate [--source <path|bundled>]  Validate source or installed state
  doctor                  Check files, router, dependencies and host bridge
  recover                 Roll back an interrupted transaction (dead owner only)

Options:
  --source <directory|bundled>  Local manifest library or bundled example library
  --project <directory>        Project directory (default: current working directory)
  --host <codex|none>           Configure one Codex discovery bridge (mutations only)
  --warn-bytes <positive-int>   Router size warning threshold (default: 32768)
  --dry-run                    Plan a mutation or recovery without writing anything
  --json                       Machine-readable output
  --help, -h                   Show this help
  --version, -v                Show package version

Paths are canonical branch/leaf paths, not IDs. Missing selectors never mean --all.
No command downloads source content or executes skill scripts.
`;
function presentation(plan: Plan) {
  return {changed:plan.changed,source:plan.selection.source,selections:plan.selection.selectors,additions:plan.additions,updates:plan.updates,removals:plan.removals,dependencies:plan.dependencies,integration:plan.integration,routerBytes:plan.routerBytes,warnings:plan.warnings};
}
async function main(): Promise<void> {
  const {values,positionals} = parseArgs({allowPositionals:true,strict:true,options:{
    help:{type:'boolean',short:'h'},version:{type:'boolean',short:'v'},source:{type:'string'},project:{type:'string'},host:{type:'string'},
    'warn-bytes':{type:'string'},all:{type:'boolean'},'dry-run':{type:'boolean'},json:{type:'boolean'}
  }});
  if (values.help) { console.log(help); return; }
  if (values.version) { console.log((JSON.parse(await readFile(path.join(packageRoot,'package.json'),'utf8')) as {version:string}).version); return; }
  if (!positionals.length) { console.log(help); return; }
  const [command,...args] = positionals;
  const project = path.resolve(values.project ?? process.cwd());
  const output = (value: unknown): void => { console.log(typeof value === 'string' && !values.json ? value : json(value).trimEnd()); };
  const mutation = ['install','remove','update'].includes(command!);
  const allowed: Record<string,string[]> = {
    install:['source','host','warn-bytes','all','dry-run'],remove:['host','warn-bytes','all','dry-run'],update:['source','host','warn-bytes','dry-run'],
    list:[],tree:[],stats:[],search:[],explain:[],validate:['source'],doctor:[],recover:['dry-run']
  };
  if (!Object.hasOwn(allowed,command!)) throw new Error(`Unknown command: ${command}. Use --help.`);
  for (const k of Object.keys(values)) if (!['project','json','help','version'].includes(k) && !allowed[command!]!.includes(k)) throw new Error(`--${k} is not supported by ${command}`);
  if (!['install','remove','search','explain'].includes(command!) && args.length) throw new Error(`${command} does not accept positional arguments.`);
  if (values.all && args.length) throw new Error('Use selectors or --all, not both.');
  if (['install','remove'].includes(command!) && args.includes('*')) throw new Error('Use explicit --all instead of a wildcard selector.');
  if (values.host !== undefined && !['codex','none'].includes(values.host)) throw new Error('--host must be codex or none');
  const warnBytes = values['warn-bytes'] === undefined ? undefined : Number(values['warn-bytes']);
  if (warnBytes !== undefined && (!Number.isSafeInteger(warnBytes) || warnBytes < 1)) throw new Error('--warn-bytes must be a positive integer');
  if (mutation) {
    const plan = await mutate(project,{command:command as 'install'|'remove'|'update',selectors:args,
      ...(values.all ? {all:true} : {}),...(values.source !== undefined ? {source:values.source} : {}),
      ...(values.host ? {host:values.host as 'codex'|'none'} : {}),...(warnBytes !== undefined ? {warnBytes} : {}),...(values['dry-run'] ? {dryRun:true} : {})});
    if (values.json) output(presentation(plan));
    else {
      console.log(`${values['dry-run'] ? 'Dry run' : 'Completed'}: ${plan.changed ? 'changes ' + (values['dry-run'] ? 'planned' : 'applied') : 'already up to date'}.`);
      for (const [label,items] of [['Add',plan.additions],['Update',plan.updates],['Remove',plan.removals]] as const) if (items.length) console.log(`${label}:\n${items.map(p => '  ' + p).join('\n')}`);
      for (const dep of plan.dependencies) console.log(`Dependency: ${dep.id} (${dep.reasons.join('; ')})`);
      console.log(`Integration: ${plan.integration}\nRouter: ${plan.routerBytes} bytes`);
      plan.warnings.forEach(w => console.warn(`Warning: ${w}`));
    }
    return;
  }
  if (command === 'recover') { output({message:values['dry-run'] ? await recover(project,true) : await withMutation(project,() => recover(project),true)}); return; }
  if (command === 'validate' && values.source) {
    const s = await loadSource(values.source,project); output({valid:true,source:s.ref,skills:s.manifest.skills.length,resources:s.manifest.resources.length}); return;
  }
  await assertIdle(project);
  const state = await requireState(project,command === 'search'); const {manifest,reasons} = state.lock;
  const items = manifest.skills.map(s => ({...s,instruction:`${s.path}/${s.entry}`,reasons:reasons[s.id]}));
  if (command === 'list') output(values.json ? {selections:state.selection.selectors,skills:items,resources:manifest.resources.map(r => ({...r,reasons:reasons[r.id]}))} : items.map(s => `${s.id}  ${s.path}\n  ${s.reasons!.join('; ')}`).join('\n') || 'No installed skills.');
  if (command === 'tree') output(values.json ? {tree:hierarchy(manifest)} : hierarchy(manifest));
  if (command === 'search') {
    if (!args.length || !args.join(' ').trim()) throw new Error('search requires a nonempty query');
    const terms = args.join(' ').toLowerCase().split(/\s+/).filter(Boolean);
    const matches = items.filter(s => {const haystack=[s.id,s.name,s.path,s.description,...s.aliases ?? [],...s.tags ?? []].join(' ').toLowerCase(); return terms.every(t => haystack.includes(t));});
    output(values.json ? matches : matches.map(s => `${s.id}  ${s.description}\n  ${s.instruction}`).join('\n') || 'No matching installed skills.');
  }
  if (command === 'explain') {
    if (args.length !== 1) throw new Error('explain requires exactly one skill ID');
    const skill = items.find(s => s.id === args[0]); if (!skill) throw new Error(`Skill is not installed: ${args[0]}`); output(skill);
  }
  if (command === 'stats') {
    const content = [...manifest.skills.map(s => `${s.path}/${s.entry}`),...manifest.resources.map(r => r.path)];
    const routerBytes=state.files.get('SKILL.md')!.length;
    output({skills:manifest.skills.length,resources:manifest.resources.length,contentBytes:content.reduce((n,p) => n+state.files.get(p)!.length,0),routerBytes,managedBytes:Object.keys(state.lock.files).reduce((n,p) => n+state.files.get(p)!.length,0),warnBytes:state.selection.warnBytes,warnings:routerBytes > state.selection.warnBytes ? ['Router exceeds configured threshold; complete map retained.'] : []});
  }
  if (command === 'validate' || command === 'doctor') {
    const custom = await customization(project);
    if (!custom.equals(state.files.get('navigation.md')!)) throw new Error('Navigation customization changed; regenerate with install <existing-selection> or update --source <source>.');
    output({valid:true,skills:manifest.skills.length,resources:manifest.resources.length,host:state.selection.host,checks:['manifest','selection closure','managed checksums','complete router','configured host bridge'],hostRuntime:'Not exercised; structural checks only.'});
  }
}
main().catch((e: unknown) => { console.error(`skill-tree: ${e instanceof Error ? e.message : String(e)}`); process.exitCode=1; });
