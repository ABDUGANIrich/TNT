import path from 'node:path';
import { assertIdle, commit, withMutation } from './filesystem.js';
import { exists, pathsConflict, safePath } from './paths.js';
import { readState } from './state.js';
import { loadSource, sourceSnapshot } from './source.js';
import { planInstallation } from './planner.js';
import { inspectImport, importFailure, type ImportOptions, type ImportReport } from './importer.js';
import { ROOT, json, type Manifest, type Plan, type Source, type State } from './model.js';

export const EDITABLE = 'editable-library';
export const editableLocation = (project: string): string => path.join(path.resolve(project),ROOT,EDITABLE);
export function checkAuthoringNamespace(manifest: Manifest): void {
  for (const p of [...manifest.skills.map(s=>s.path),...manifest.resources.map(r=>r.path),...manifest.branches.map(b=>b.path)]) {
    if (p.toLowerCase()===EDITABLE || p.toLowerCase().startsWith(EDITABLE+'/')) throw new Error(`The ${EDITABLE}/ path is reserved for editable source. Move that source skill/resource to another branch before customizing.`);
  }
}
export interface AuthorResult {
  plan: Plan; compatibility?: ImportReport; sourceDirectory: string; editFile?: string; sourceCreated: boolean;
}
export async function authoringBase(project: string, previous: State | null, allowChanges=false): Promise<{source:Source; created:boolean}> {
  const location=await safePath(project,`${ROOT}/${EDITABLE}`);
  const owned=previous?.selection.source.kind==='local' && path.resolve(previous.selection.source.location)===location;
  if (!owned && await exists(location)) throw new Error(`Unowned ${ROOT}/${EDITABLE} exists. Move it aside before import/customize; no files were changed.`);
  let source:Source;
  if (previous) {
    source=await loadSource(previous.selection.source.location,project);
    if (source.ref.id!==previous.selection.source.id) throw new Error('Source library identity changed; restore its original ID before customizing.');
    if (source.ref.revision!==previous.selection.source.revision && !(owned && allowChanges)) throw new Error(owned ? 'Editable source has pending changes. Run skill-tree sync first.' : 'Source revision changed. Run update --source <source> before import/customize.');
  } else source=sourceSnapshot({schemaVersion:1,id:'project-skills',version:'1.0.0',name:'Progressive Skill Library',description:'Project-maintained custom workflows.',branches:[],skills:[],resources:[]},new Map(),{kind:'local',location});
  checkAuthoringNamespace(source.manifest);
  return {source:sourceSnapshot(source.manifest,source.files,{kind:'local',location}),created:!owned};
}

// Editable files are user-owned source inputs, excluded from installed checksums.
// They share the existing root transaction so source registration and router commit together.
function attachEditableSource(plan:Plan, source:Source, previous:State|null, created:boolean, base:Source):void {
  const files=new Map([...source.files].map(([p,b])=>[`${EDITABLE}/${p}`,b]));
  files.set(`${EDITABLE}/library.json`,Buffer.from(json(source.manifest)));
  for (const [p,b] of files) {
    const prior=previous?.files.get(p);
    if (prior && (created || (p!==`${EDITABLE}/library.json` && !base.files.has(p.slice(EDITABLE.length+1))))) {
      throw new Error(`Unowned editable file would be overwritten: ${p}. Move it aside or choose a different --into path.`);
    }
    if (prior?.equals(b)) continue;
    // Existing declared source content came from the user's current snapshot. Only
    // registration metadata and new imports are written; never replace unrelated files.
    for (const old of previous?.files.keys() ?? []) {
      if (old===p) continue;
      if (pathsConflict(old,p)) throw new Error(`Editable source path conflicts with an existing file: ${old}`);
    }
    plan.files.set(p,b);
    (prior ? plan.updates : plan.additions).push(p);
  }
  plan.additions.sort();plan.updates.sort();
  plan.changed=plan.changed || plan.additions.length>0 || plan.updates.length>0;
}

export async function author(project:string, command:'import'|'customize'|'sync', target:string|undefined, options:ImportOptions & {dryRun?:boolean}={}):Promise<AuthorResult> {
  const action=async():Promise<AuthorResult>=>{
    const previous=await readState(project);
    if (command!=='import' && !previous) throw new Error('Install or import a skill first.');
    if (command==='sync' && (previous!.selection.source.kind!=='local' || path.resolve(previous!.selection.source.location)!==editableLocation(project))) throw new Error('No editable project source. Run customize <installed-skill-id> or import <file-or-folder> first.');
    const {source:base,created}=await authoringBase(project,previous,command==='sync');
    let source=base;let report:ImportReport|undefined;let editFile:string|undefined;
    let selectors=previous?.selection.selectors ?? [];
    if (command==='import') {
      if (!target) throw new Error('import requires a Markdown file or skill folder.');
      const analysis=await inspectImport(path.resolve(project,target),options,base.manifest);report=analysis.report;
      if (!report.compatible) throw importFailure(report);
      const skill=report.skill!;
      const manifest={...base.manifest,skills:[...base.manifest.skills,skill],resources:[...base.manifest.resources,...report.resources]};
      checkAuthoringNamespace(manifest);
      source=sourceSnapshot(manifest,new Map([...base.files,...analysis.content]),{kind:'local',location:editableLocation(project)});
      selectors=[...new Set([...selectors,skill.path])].sort();
      editFile=`${ROOT}/${EDITABLE}/${skill.path}/${skill.entry}`;
    } else if (command==='customize') {
      const skill=previous!.lock.manifest.skills.find(s=>s.id===target);
      if (!skill) throw new Error(`Skill is not installed: ${target ?? ''}. Use list to find its stable ID.`);
      editFile=`${ROOT}/${EDITABLE}/${skill.path}/${skill.entry}`;
    }
    const selection={schemaVersion:1 as const,source:source.ref,selectors,host:previous?.selection.host ?? 'none',warnBytes:previous?.selection.warnBytes ?? 32768};
    const plan=await planInstallation(project,source,selection,previous);
    attachEditableSource(plan,source,previous,created,base);
    if (created) plan.warnings.push(`Create an editable copy of the complete source (${source.manifest.skills.length} skills). Installed selections stay selective; future updates use this project copy.`);
    if (!options.dryRun) await commit(project,plan,previous);
    return {plan,...(report ? {compatibility:report} : {}),sourceDirectory:`${ROOT}/${EDITABLE}`,sourceCreated:created,...(editFile ? {editFile} : {})};
  };
  if (options.dryRun) {await assertIdle(project);return action();}
  return withMutation(project,action);
}

export async function checkImport(project:string,target:string,options:ImportOptions={}):Promise<ImportReport> {
  await assertIdle(project);
  const previous=await readState(project);
  const {source}=await authoringBase(project,previous);
  const {report}=await inspectImport(path.resolve(project,target),options,source.manifest);
  if (report.skill) {
    try {checkAuthoringNamespace({...source.manifest,skills:[...source.manifest.skills,report.skill]});}
    catch(e) {report.compatible=false;report.issues.push({severity:'error',code:'reserved-path',file:report.skill.path,message:(e as Error).message,fix:'Choose a different --into branch.'});}
  }
  return report;
}
