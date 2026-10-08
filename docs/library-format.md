# Library format: schema version 1

A source is a local directory containing `library.json`. `loadSource` validates the entire library before selection, including unselected entries and dependencies. Only manifest-declared entry/resource files are copied. There are no directory globs or implicit ancestor instructions.

```json
{
  "schemaVersion": 1,
  "id": "my-team-library",
  "version": "1.0.0",
  "name": "Team workflows",
  "description": "Focused engineering workflows for this team.",
  "branches": [{ "path": "web", "description": "Browser work" }],
  "skills": [
    {
      "id": "team.react-forms",
      "path": "web/react/forms",
      "name": "React forms",
      "description": "Implement React form validation and recoverable submission.",
      "entry": "instructions.md",
      "dependencies": [{ "kind": "resource", "id": "team.form-cases" }],
      "aliases": ["form validation"],
      "tags": ["react"],
      "prerequisites": ["Existing React project and test runner"]
    }
  ],
  "resources": [
    {
      "id": "team.form-cases",
      "path": "shared/forms/cases.md",
      "name": "Form cases",
      "description": "Worksheet for inputs and expected outcomes."
    }
  ]
}
```

Create `web/react/forms/instructions.md` and `shared/forms/cases.md` beside this manifest, then validate with `npx skill-tree validate --source "./my library"`.

## Fields and invariants

- Root fields are required. `schemaVersion` is the number `1`. `id` identifies one library across revisions; `version` is an author-controlled, nonempty label. The CLI also calculates a SHA-256 content revision, so changes cannot hide behind an unchanged version label.
- `branches` is an array of optional category descriptions. Entries require `path`; `description` is optional. Undeclared ancestor categories are inferred from leaf/resource paths. Empty branches are not installed or advertised.
- Skills require globally unique `id`, directory `path`, short `name`, routing `description`, relative `entry`, and `dependencies` array (use `[]` when empty). `aliases`, `tags`, and `prerequisites` are optional string arrays. Prerequisites describe environment/tools; the tool does not install or verify these external requirements.
- Resources require globally unique `id`, file `path`, `name`, and `description`. A resource is one file, so bundles of supporting files require separate declarations. Resources have no outgoing dependencies.
- Dependency objects contain exactly `kind` (`skill` or `resource`) and stable `id`. A skill dependency means required instructions, transitively; a resource dependency means required installed support content read only on demand. IDs remain unchanged when a canonical path is moved.
- IDs for skills/resources match `[a-z0-9][a-z0-9.-]*`. Skills and resources share one ID namespace. Renaming a selected leaf path does not silently migrate selection intent; update fails and the user must explicitly change selections using the old revision first.
- All manifest paths are slash-separated, relative, portable ASCII paths, at most 220 characters per declared path (including resolved entry paths). Components start with an ASCII letter or digit and then use letters, digits, `.`, `_`, or `-`. Absolute paths, backslashes, `.`/`..`, empty components, Windows device names, colon/ADS syntax, trailing dots, and case aliases are rejected. Project/source directory paths may contain spaces, apostrophes, and Unicode.
- Names/descriptions/version labels are nonempty, single-line strings of at most 1,000 characters. Keep routing descriptions much shorter in practice. Optional strings follow the same rule. Unknown metadata fields fail to catch authoring typos.
- `library.json`, `SKILL.md`, `selection.json`, `lock.json`, `router-template.md`, and `navigation.md` at the root are reserved. The source manifest cannot double as a content resource. Internal skill entries and resources cannot be called `SKILL.md`. Skills cannot contain nested skill/branch nodes. Resource files may live within a leaf or in shared categories.
- Duplicate IDs, case-insensitive path collisions, file/directory collisions, missing files, nonregular files, unknown or mistyped dependencies, duplicate dependencies, and cycles are rejected. A symlink in any declared source path is rejected. Files merely present elsewhere in the source have no effect and are not copied.

The TypeScript validator in `src/manifest.ts` is the executable format definition. No second manually maintained metadata schema duplicates it. Tests cover the validation contract. Internal metadata uses this versioned JSON format. The separate external importer accepts YAML frontmatter and converts it into this manifest; see [custom skills](custom-skills.md).

## Writing useful workflows

Describe the concrete task that triggers a skill and distinguish it from neighboring workflows. Name required inputs, the decisions the workflow helps make, and its expected output. Include bounded verification steps and stop conditions. Avoid repeating general agent instructions or copying a router into every branch.

Put critical prerequisite instructions in their own skill and declare a `kind: "skill"` dependency. Put templates, scripts, and long references in resource files and declare `kind: "resource"` dependencies. Do not rely on a parent folder to provide essential guidance. Scripts remain inert files during installation and must be reviewed before any later agent execution.

Keep all manually authored selection metadata in `library.json`; generated state and root catalogs derive from it. A source's undeclared files, including a README stored in an ancestor folder, are never implicit resources.
