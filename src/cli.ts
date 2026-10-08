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
import { author, checkImport, editableLocation } from './authoring.js';
import type { ImportOptions } from './importer.js';

const help = `Progressive Skill Library — skill-tree

Usage: skill-tree <command> [selectors] [options]
  install <branch|leaf>...  Add explicit selections and required dependencies
  install --all            Explicitly select the entire library
  remove <selection>...    Remove exact explicit selections; recompute dependencies
  remove --all             Remove all selections (keep metadata and unknown files)
  update --source <path|bundled>  Reconcile selections against an explicit revision
  check <file|folder>      Check import compatibility and show fixes without writing
  import <file|folder>     Register, install, and create an editable project source
  customize <skill-id>     Create editable source and report the file to edit
  sync                    Validate editable source and apply edits to installed skills
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
  --into <leaf-path>            Import destination (default: custom/<filename>)
  --id <stable-id>              Imported skill ID (default derived from destination)
  --name <name>                 Override imported name
  --description <text>          Override routing description
  --entry <relative-file.md>    Select a folder's instruction entry
  --requires <skill-id>         Required instruction ID (repeatable)
  --prerequisite <text>         Environment/tool requirement (repeatable)
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
    'warn-bytes':{type:'string'},all:{type:'boolean'},'dry-run':{type:'boolean'},json:{type:'boolean'},
    into:{type:'string'},id:{type:'string'},name:{type:'string'},description:{type:'string'},entry:{type:'string'},
    requires:{type:'string',multiple:true},prerequisite:{type:'string',multiple:true}
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
  const importFlags=['into','id','name','description','entry','requires','prerequisite'];
  allowed.check=importFlags;allowed.import=[...importFlags,'dry-run'];allowed.customize=['dry-run'];allowed.sync=['dry-run'];
  if (!Object.hasOwn(allowed,command!)) throw new Error(`Unknown command: ${command}. Use --help.`);
  for (const k of Object.keys(values)) if (!['project','json','help','version'].includes(k) && !allowed[command!]!.includes(k)) throw new Error(`--${k} is not supported by ${command}`);
  if (!['install','remove','search','explain','import','check','customize'].includes(command!) && args.length) throw new Error(`${command} does not accept positional arguments.`);
  if (values.all && args.length) throw new Error('Use selectors or --all, not both.');
  if (['install','remove'].includes(command!) && args.includes('*')) throw new Error('Use explicit --all instead of a wildcard selector.');
  if (values.host !== undefined && !['codex','none'].includes(values.host)) throw new Error('--host must be codex or none');
  const warnBytes = values['warn-bytes'] === undefined ? undefined : Number(values['warn-bytes']);
  if (warnBytes !== undefined && (!Number.isSafeInteger(warnBytes) || warnBytes < 1)) throw new Error('--warn-bytes must be a positive integer');
  if (['check','import','customize','sync'].includes(command!)) {
    if (command!=='sync' && args.length!==1) throw new Error(`${command} requires exactly one ${command==='customize' ? 'installed skill ID' : 'Markdown file or skill folder'}.`);
    const options:ImportOptions={
      ...(values.into!==undefined ? {into:values.into} : {}),...(values.id!==undefined ? {id:values.id} : {}),
      ...(values.name!==undefined ? {name:values.name} : {}),...(values.description!==undefined ? {description:values.description} : {}),
      ...(values.entry!==undefined ? {entry:values.entry} : {}),...(values.requires ? {requires:values.requires} : {}),...(values.prerequisite ? {prerequisites:values.prerequisite} : {})
    };
    if (command==='check') {
      const report=await checkImport(project,args[0]!,options);
      if (values.json) output(report);
      else {
        console.log(report.compatible ? 'Compatible for import (structural checks passed).' : 'Not compatible for import.');
        if (report.skill) console.log(`Skill: ${report.skill.id}\nDestination: ${report.skill.path}/${report.skill.entry}`);
        report.conversions.forEach(c=>console.log(`Conversion: ${c}`));
        report.issues.forEach(i=>console.log(`${i.severity}: ${i.file}: ${i.message}\n  Fix: ${i.fix}`));
        console.log(report.scope);
      }
      if (!report.compatible) process.exitCode=1;
    } else {
      const result=await author(project,command as 'import'|'customize'|'sync',args[0],{...options,...(values['dry-run'] ? {dryRun:true} : {})});
      if (values.json) output({...presentation(result.plan),editFile:result.editFile,sourceDirectory:result.sourceDirectory,sourceCreated:result.sourceCreated,compatibility:result.compatibility});
      else {
        console.log(`${values['dry-run'] ? 'Dry run' : 'Completed'}: ${command}.`);
        for (const [label,items] of [['Add',result.plan.additions],['Update',result.plan.updates],['Remove',result.plan.removals]] as const) if (items.length) console.log(`${label}:\n${items.map(p=>'  '+p).join('\n')}`);
        result.compatibility?.conversions.forEach(c=>console.log(`Conversion: ${c}`));
        for (const dep of result.plan.dependencies) console.log(`Dependency: ${dep.id} (${dep.reasons.join('; ')})`);
        result.compatibility?.issues.forEach(i=>console.log(`${i.severity}: ${i.message}\n  ${i.fix}`));
        if (result.compatibility) console.log(result.compatibility.scope);
        result.plan.warnings.forEach(w=>console.warn(`Warning: ${w}`));
        console.log(`Integration: ${result.plan.integration}\nRouter: ${result.plan.routerBytes} bytes\nEditable source: ${result.sourceDirectory}`);
        if (result.editFile) console.log(`Edit: ${result.editFile}`);
        console.log('After editing source files, run skill-tree sync. Installed copies remain protected.');
      }
    }
    return;
  }
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
    let sourceStatus='external source not checked';
    if (state.selection.source.kind==='local' && path.resolve(state.selection.source.location)===editableLocation(project)) {
      const source=await loadSource(editableLocation(project),project);
      sourceStatus=source.ref.revision===state.selection.source.revision ? 'editable source synchronized' : 'editable source has pending changes; run skill-tree sync';
    }
    output({valid:true,sourceStatus,skills:manifest.skills.length,resources:manifest.resources.length,host:state.selection.host,checks:['manifest','selection closure','managed checksums','complete router','configured host bridge'],hostRuntime:'Not exercised; structural checks only.'});
  }
}
main().catch((e: unknown) => { console.error(`skill-tree: ${e instanceof Error ? e.message : String(e)}`); process.exitCode=1; });
