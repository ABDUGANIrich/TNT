export interface Dependency { kind: 'skill' | 'resource'; id: string }
export interface Branch { path: string; description?: string }
export interface Skill {
  id: string; path: string; name: string; description: string; entry: string;
  dependencies: Dependency[]; aliases?: string[]; tags?: string[]; prerequisites?: string[];
}
export interface Resource { id: string; path: string; name: string; description: string }
export interface Manifest {
  schemaVersion: 1; id: string; version: string; name: string; description: string;
  branches: Branch[]; skills: Skill[]; resources: Resource[];
}
export interface SourceRef { kind: 'bundled' | 'local'; location: string; id: string; version: string; revision: string }
export interface Source { manifest: Manifest; ref: SourceRef; files: Map<string, Buffer> }
export interface Selection { schemaVersion: 1; source: SourceRef; selectors: string[]; host: 'none' | 'codex'; warnBytes: number }
export interface Resolved { manifest: Manifest; reasons: Record<string, string[]> }
export interface Lock {
  schemaVersion: 1; generatorVersion: 1; source: SourceRef; manifest: Manifest;
  reasons: Record<string, string[]>; files: Record<string, string>;
  integration: { path: string; checksum: string } | null;
}
export interface State { selection: Selection; lock: Lock; files: Map<string, Buffer>; bridge: Buffer | null }
export interface Plan {
  selection: Selection; lock: Lock; files: Map<string, Buffer>; bridge: Buffer | null;
  additions: string[]; updates: string[]; removals: string[]; dependencies: { id: string; reasons: string[] }[];
  integration: string; routerBytes: number; warnings: string[]; changed: boolean;
}
export const ROOT = '.skill-tree';
export const BRIDGE = '.agents/skills/progressive-skill-library/SKILL.md';
export const CUSTOM = '.skill-tree-custom.md';
export const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
export const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
