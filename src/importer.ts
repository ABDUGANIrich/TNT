import * as fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { canonical, hash, regularRead, safePath } from './paths.js';
import { validateManifest } from './manifest.js';
import type { Manifest, Resource, Skill } from './model.js';

export interface ImportOptions {
  into?: string; id?: string; name?: string; description?: string; entry?: string;
  requires?: string[]; prerequisites?: string[];
}
export interface ImportIssue { severity: 'error'|'warning'; code: string; file: string; message: string; fix: string }
export interface ImportReport {
  compatible: boolean; skill: Skill | null; resources: Resource[]; files: string[];
  conversions: string[]; issues: ImportIssue[];
  scope: string;
}
export interface ImportAnalysis { report: ImportReport; content: Map<string,Buffer> }
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const oneLine = (s: string): string => s.replace(/\s+/g,' ').trim();
const emptyManifest = (): Manifest => ({schemaVersion:1,id:'import-check',version:'1',name:'Import check',description:'Import compatibility check',branches:[],skills:[],resources:[]});

async function candidateFiles(input: string): Promise<{files:Map<string,Buffer>; directory:boolean}> {
  const target = await safePath(input); const stat=await fs.lstat(target);
  const files=new Map<string,Buffer>(); let bytes=0;
  async function add(root: string, relative: string): Promise<void> {
    const file=await safePath(root,relative); const size=(await fs.lstat(file)).size;
    bytes+=size;
    if (files.size>=512 || bytes>20*1024*1024) throw new Error('Import exceeds 512 files or 20 MiB. Split the skill or remove unrelated assets.');
    files.set(relative,await regularRead(root,relative));
  }
  async function walk(root: string, prefix: string): Promise<void> {
    for (const item of await fs.readdir(await safePath(root,prefix),{withFileTypes:true})) {
      const relative=prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isSymbolicLink()) throw new Error(`Symlink/junction refused: ${relative}. Replace it with an ordinary file inside the skill folder.`);
      if (item.isDirectory()) await walk(root,relative);
      else if (item.isFile()) await add(root,relative);
      else throw new Error(`Not a regular file: ${relative}`);
    }
  }
  if (stat.isDirectory()) await walk(target,'');
  else if (stat.isFile()) await add(path.dirname(target),path.basename(target));
  else throw new Error('Input must be a Markdown file or a skill directory.');
  return {files,directory:stat.isDirectory()};
}

export async function inspectImport(input: string, options: ImportOptions = {}, base?: Manifest): Promise<ImportAnalysis> {
  const report: ImportReport={compatible:false,skill:null,resources:[],files:[],conversions:[],issues:[],scope:'Structural compatibility only. Tools, prose references, script behavior, licensing permission, and task success require review.'};
  const content=new Map<string,Buffer>();
  const issue=(code:string,file:string,message:string,fix:string,severity:'error'|'warning'='error'):void=>{report.issues.push({severity,code,file,message,fix});};
  try {
    const {files,directory}=await candidateFiles(input);
    const candidates=[...files.keys()].filter(p=>!p.includes('/') && /\.md$/i.test(p));
    const entry=options.entry ?? (!directory ? [...files.keys()][0] : files.has('SKILL.md') ? 'SKILL.md' : files.has('instructions.md') ? 'instructions.md' : candidates.length===1 ? candidates[0] : undefined);
    if (!entry || !files.has(entry) || !/\.md$/i.test(entry)) {
      issue('entry',input,'No unambiguous Markdown instruction entry.','Add SKILL.md or instructions.md, or pass --entry <relative-file.md>.'); return {report,content};
    }
    for (const p of files.keys()) {
      try { canonical(p); } catch { issue('path',p,'This resource path is not portable.','Rename it to slash-separated letters/digits/dots/dashes/underscores with no leading dots or spaces; update references.'); }
      if (p!==entry && p.split('/').some(part=>part.toLowerCase()==='skill.md')) issue('nested-skill',p,'A supporting file looks like another discoverable skill.','Import each skill separately and declare required instruction IDs with --requires; rename ordinary references.');
      if (/^(agents\/|\.mcp|hooks\/)/i.test(p)) issue('host-config',p,'Host-specific configuration cannot be installed as portable skill behavior.','Import a copy without host configuration; describe required tools using --prerequisite and configure the host separately.');
    }
    let text: string;
    try {text=new TextDecoder('utf-8',{fatal:true}).decode(files.get(entry)!);} catch {issue('encoding',entry,'Instruction entry is not valid UTF-8.','Save it as UTF-8 Markdown.');return {report,content};}
    if (text.includes('\0')) {issue('encoding',entry,'Instruction entry contains binary NUL bytes.','Save it as UTF-8 text.');return {report,content};}
    let front: Record<string,unknown>={};
    if (/^---\r?\n/.test(text)) {
      const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
      if (!match) {issue('frontmatter',entry,'Unclosed YAML frontmatter.','Close the header with a line containing --- before the Markdown body.');return {report,content};}
      try {
        const doc=parseDocument(match[1]!,{uniqueKeys:true});
        if (doc.errors.length || doc.warnings.length) throw new Error([...doc.errors,...doc.warnings].map(e=>e.message).join('; '));
        const value:unknown=doc.toJS({maxAliasCount:0});
        if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Frontmatter must be a mapping');
        front=value as Record<string,unknown>;
      } catch (e) {issue('frontmatter',entry,`Invalid frontmatter: ${(e as Error).message}`,'Use a YAML mapping with unique keys and no aliases/custom tags; quote strings containing special characters.');return {report,content};}
      text=text.slice(match[0].length);
      report.conversions.push('Move routing name/description into library.json and remove entry frontmatter.');
    }
    for (const key of Object.keys(front)) {
      if (!['name','description','compatibility','license','metadata'].includes(key)) issue('host-field',entry,`Unsupported frontmatter field: ${key}.`,'Remove this field from an import copy. Use --requires <skill-id> for instructions and --prerequisite for tool needs; configure host permissions separately.');
    }
    for (const k of ['name','description','compatibility','license']) if (front[k]!==undefined && typeof front[k]!=='string') issue('metadata-type',entry,`${k} must be a string.`,`Quote ${k} as a YAML string or remove it.`);
    if (front.metadata!==undefined && (!front.metadata || typeof front.metadata!=='object' || Array.isArray(front.metadata) || Object.values(front.metadata).some(v=>typeof v!=='string'))) issue('metadata-type',entry,'metadata must map keys to strings.','Convert metadata values to quoted strings or remove that field.');
    if (!text.trim()) issue('empty-body',entry,'The skill has no instruction body.','Add bounded task instructions below the frontmatter.');
    const stem=directory ? path.basename(path.resolve(input)) : path.basename(entry,'.md');
    const name=options.name ?? (typeof front.name==='string' ? front.name : /^#\s+(.+)$/m.exec(text)?.[1] ?? stem);
    const description=options.description ?? (typeof front.description==='string' ? oneLine(front.description) : text.split(/\r?\n\s*\r?\n/).map(oneLine).find(p=>p && !/^(#|```|~~~|\||[-*] )/.test(p))?.slice(0,240));
    if (!description) issue('description',entry,'No concise routing description was found.','Pass --description "When to use this workflow", or add description frontmatter/a prose paragraph.');
    const into=options.into ?? `custom/${slug(stem) || 'skill'}`;
    const id=options.id ?? `custom.${slug(into.replace(/^custom\//,'')) || 'skill'}`;
    const renamed=path.posix.basename(entry).toLowerCase()==='skill.md' ? path.posix.join(path.posix.dirname(entry),'instructions.md') : entry;
    if (renamed!==entry) {
      report.conversions.push(`Rename ${entry} to ${renamed} to keep the leaf outside host discovery.`);
      if (files.has(renamed)) issue('rename-collision',renamed,'Renaming SKILL.md would overwrite an existing file.','Rename the conflicting file in a copy of the input and fix its references.');
    }
    if (typeof front.license==='string' || front.metadata!==undefined) {
      text+=`\n\n## Imported provenance\n\n${typeof front.license==='string' ? 'License: '+front.license+'\n\n' : ''}${front.metadata!==undefined ? '\x60\x60\x60json\n'+JSON.stringify(front.metadata,null,2)+'\n\x60\x60\x60\n' : ''}`;
      report.conversions.push('Preserve license and non-routing metadata in an entry provenance section.');
    }
    const prerequisites=[...(typeof front.compatibility==='string' ? [oneLine(front.compatibility)] : []),...options.prerequisites ?? []];
    const skill:Skill={id,path:into,name:oneLine(name),description:description ?? '',entry:renamed,dependencies:[...new Set(options.requires ?? [])].map(id=>({kind:'skill',id})),...(prerequisites.length ? {prerequisites} : {})};
    report.skill=skill;
    const transformed=new Map(files); transformed.delete(entry);transformed.set(renamed,Buffer.from(text));
    // Check explicit Markdown destinations and inline file paths. Never follow links outside input.
    for (const [p,bytes] of transformed) if (/\.md$/i.test(p)) {
      let markdown:string;
      try {markdown=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
      catch {issue('encoding',p,'Supporting Markdown is not valid UTF-8.','Save Markdown references as UTF-8; keep binary resources under their correct file extension.');continue;}
      const checkTarget=(raw:string):string=>{
        if (/^(?:https?:|mailto:|data:|#)/i.test(raw)) return raw;
        let decoded:string;
        try {decoded=decodeURIComponent(raw.split(/[?#]/)[0]!);} catch {issue('reference',p,`Invalid encoded reference: ${raw}`,'Correct the URL encoding.');return raw;}
        if (!decoded) return raw;
        const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(p),decoded));
        if (decoded.startsWith('/') || /^[a-z]:|\\/i.test(decoded) || resolved==='..' || resolved.startsWith('../')) issue('external-reference',p,`Reference escapes the imported skill: ${raw}`,'Copy the referenced resource inside this folder and update the link, or import a prerequisite separately and declare --requires.');
        else if (resolved===entry && renamed!==entry) {
          const next=path.posix.relative(path.posix.dirname(p),renamed);
          report.conversions.push(`Rewrite ${raw} to ${next} in ${p}.`);
          return next+(raw.match(/[?#].*$/)?.[0] ?? '');
        } else if (!transformed.has(resolved) && ![...transformed.keys()].some(f=>f.startsWith(resolved+'/'))) issue('missing-reference',p,`Missing local reference: ${raw}`,'Include the referenced file and correct its case/path. For a standalone Markdown file with resources, import its containing skill folder.');
        return raw;
      };
      markdown=markdown.replace(/(!?\[[^\]\n]*\]\()(<[^>\n]+>|[^\s)]+)([^)\n]*\))/g,(_all:string,a:string,b:string,c:string)=>a+(b.startsWith('<') ? '<'+checkTarget(b.slice(1,-1))+'>' : checkTarget(b))+c);
      markdown=markdown.replace(/^(\s{0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|\S+)/gm,(_all:string,a:string,b:string)=>a+(b.startsWith('<') ? '<'+checkTarget(b.slice(1,-1))+'>' : checkTarget(b)));
      markdown=markdown.replace(/`((?:\.\.?\/|scripts\/|references\/|assets\/)[^`\n\s]+\.[a-z0-9]+)`/gi,(_all:string,target:string)=>'`'+checkTarget(target)+'`');
      transformed.set(p,Buffer.from(markdown));
    }
    for (const [p,b] of transformed) {
      content.set(`${into}/${p}`,b);
      if (p===renamed) continue;
      const resource:Resource={id:`${id}.resource.${hash(p).slice(0,16)}`,path:`${into}/${p}`,name:path.posix.basename(p),description:`Supporting file for ${oneLine(name)}: ${p}`};
      report.resources.push(resource); skill.dependencies.push({kind:'resource',id:resource.id});
    }
    if (report.resources.length) report.conversions.push(`Register ${report.resources.length} supporting files as resources; scripts stay inert.`);
    const m=base ?? emptyManifest();
    try {validateManifest({...m,skills:[...m.skills,skill],resources:[...m.resources,...report.resources]});}
    catch(e) {issue('manifest',into,(e as Error).message,'Choose a unique --id and --into path; supply valid metadata. Required IDs must already exist in this library (check them with list).');}
    if (prerequisites.length || [...files.keys()].some(p=>/^scripts\//.test(p))) issue('environment',entry,'Tool/environment availability and script behavior have not been verified.','Review prerequisites and script source before running the skill. Installation never executes scripts.','warning');
    report.files=[...content.keys()].sort();
    report.compatible=!report.issues.some(i=>i.severity==='error');
  } catch(e) {issue('input',input,(e as Error).message,'Use an existing local Markdown file or a small self-contained skill folder with ordinary files; fix the reported path and retry check.');}
  return {report,content};
}
export function importFailure(report: ImportReport): Error {
  return new Error('Skill is not compatible:\n'+report.issues.filter(i=>i.severity==='error').map(i=>`- ${i.file}: ${i.message}\n  Fix: ${i.fix}`).join('\n'));
}
