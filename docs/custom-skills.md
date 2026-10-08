# Custom skills: import, customize, and sync

Use `import` to register new skill content, `customize` to prepare installed workflows for editing, and `sync` to apply edits. All mutations use the existing project lock, staged root replacement, and recovery journal. `check` and `--dry-run` never write files. Commands do not launch editors, execute imported scripts, fetch URLs, or grant host permissions.

## Standalone Markdown

```sh
npx skill-tree check ./example.md --json
npx skill-tree import ./example.md --into custom/release --id team.release
```

Plain Markdown is accepted without frontmatter. The name comes from its first level-one heading or filename. A first prose paragraph supplies a routing description, shortened to 240 characters; review it in the check/dry-run output. For heading-only instructions or a more precise description:

```sh
npx skill-tree import ./example.md --name "Release review" --description "Check release notes against the change list"
```

The default leaf path is `custom/<slugged-input-filename-or-folder>`, with a stable ID derived from that destination. Use `--into` and `--id` when default names collide. Duplicate imports refuse to overwrite existing skills; customize the existing source or choose a new identity/path.

A standalone file cannot implicitly bring sibling resources. If its local links point to other files, put the instructions and resources in a self-contained folder and import that folder instead.

## External skill folders

```text
release-review/
  SKILL.md
  references/cases.md
  scripts/check.mjs
  assets/report-template.md
```

```sh
npx skill-tree check ./release-review --into documentation/release
npx skill-tree import ./release-review --into documentation/release --requires testing.test-design --prerequisite "Git CLI"
```

Entry selection prefers root `SKILL.md`, then root `instructions.md`, then a single root Markdown file. Multiple candidates require `--entry <relative-file.md>`. A `SKILL.md` entry is renamed to `instructions.md` in the same relative directory; a conflicting existing file is an error. The source input is never changed.

The importer reads YAML frontmatter according to these conversion rules, based on the [Agent Skills format](https://agentskills.io/specification):

| Field | Conversion |
| --- | --- |
| `name`, `description` | Move to the authoritative `library.json` skill metadata; CLI overrides take precedence |
| `compatibility` | Add an environment prerequisite; availability is not checked |
| `license`, `metadata` | Preserve as provenance text in the imported instructions; metadata must map keys to strings |
| Other fields, including `allowed-tools` or host-specific hooks/model settings | Reject with a repair message; no host permission/configuration translation is attempted |

YAML parsing uses the pinned [`yaml` parser](https://eemeli.org/yaml/). Duplicate keys, aliases, custom-tag warnings, malformed headers, and invalid field types are rejected. Folded or literal scalar descriptions are normalized to a single line. Internal skill instructions no longer contain frontmatter; edit routing metadata in `library.json` after import.

Every other ordinary input file becomes a declared supporting resource. Binary assets are copied as bytes; supporting Markdown must be valid UTF-8. Resource IDs are stable derivatives of the skill ID and relative filename. Scripts are copied but never executed. Review the exact file inventory in `check --json` or `import --dry-run`; use a dedicated skill folder rather than an entire repository.

Required instruction dependencies are explicit, repeatable `--requires <skill-id>` arguments, resolved against the active source. Resources are never silently promoted to instruction prerequisites. An additional `SKILL.md` elsewhere in the input is treated as a nested skill and rejected; import it separately and declare its stable ID if required.

## Compatibility and repair examples

| Report | What to do |
| --- | --- |
| Missing routing description | Supply `--description`, add frontmatter, or add a concise prose paragraph |
| Ambiguous entry | Specify `--entry` or give the folder a single conventional instruction entry |
| Missing local reference | Include the resource and correct the link/case; import the folder instead of only the entry |
| Reference escapes the input | Move the resource inside the skill and update references; import prerequisite instructions separately |
| Unsupported host field / `agents/` configuration | Import a copy without host settings; configure the host separately and describe tool needs as prerequisites |
| Nested skill | Import each workflow individually and use `--requires` for essential instructions |
| Nonportable path | Rename path components and update references; avoid leading dots, spaces, Windows device names, and traversal |
| Symlink/junction | Replace with ordinary files inside the input folder |
| Destination/ID collision | Choose distinct `--into`/`--id`, or edit the already imported source |
| Rename collision | Rename the conflicting `instructions.md` in an input copy and fix references |

Checks inspect inline Markdown links/images, reference-style definitions, and simple backticked `scripts/`, `references/`, `assets/`, `./`, or `../` file paths in Markdown. Links to the renamed entry are updated, including fragments. HTTP(S), mailto, data links, and same-document anchors are not fetched. This is deliberately bounded static checking, not a full Markdown interpreter: arbitrary prose paths, HTML links, code snippets, dynamically constructed script paths, and host-specific behavior require human review. URL checks do not establish licensing permission, tool availability, or task success.

Input limits are 512 files and 20 MiB in total. Portable manifest path rules still apply. `check --json` includes `compatible`, converted metadata, resource/file inventories, conversion notes, and issues with `severity`, `code`, `file`, `message`, and `fix`. Incompatibility exits nonzero. `import` performs the same checks before any content commit.

## Editing and source ownership

The first import/customize creates `.skill-tree/editable-library/library.json` and source files. For an existing installation it copies the complete validated source, preserving its ID, version, all current selections, and host setting. This supports later installing previously unselected branches. For a fresh project it starts an empty custom source and installs only the imported workflow.

This full editable source copy intentionally uses more disk space than the selectively installed content. It is not an additional discovery catalog: it has no generated router, is outside host skill discovery, and is not listed in the installed root map. `list`, `tree`, and content statistics describe installed selections. Source files are excluded from installed checksums so you can edit them.

```sh
npx skill-tree customize react.forms --dry-run
npx skill-tree customize react.forms
# Edit the exact path printed by the command using your editor.
npx skill-tree sync --dry-run
npx skill-tree sync
```

`customize` accepts an installed stable ID. It prints an editable path and does not launch a shell/editor. Source metadata can be edited directly in `editable-library/library.json`; `sync` validates it, preserves explicit selection intent, and regenerates the router. Sync may normalize manifest JSON formatting. New files must be declared in the manifest to be installed, or added through another import.

`doctor` reports valid installed content and whether the editable source has pending changes. An invalid source makes doctor/sync fail, while the previous installed snapshot remains readable through list/tree. Pending source changes must be synced before another import/customize to avoid silently applying unrelated edits. Invalid dependencies, vanished selected paths, conflicts, or modified installed copies block sync without destroying source edits.

The editable tree is now the one active source. A newer npm package does not merge upstream example changes into your personalized source. Merge those changes manually into the editable library and sync. Choosing `update --source bundled` is an explicit source switch, may discard installed customizations or fail if custom selections are missing, and is not the normal customization workflow.

Removing selections preserves editable content for later reinstall. Unknown editable files are also preserved: imports refuse to replace or adopt an unregistered file, even if its bytes match the input. Move that file aside or choose a different `--into` path. An unowned preexisting `editable-library` directory is never automatically adopted. The path prefix is reserved for authoring when this workflow is active. Keep backups/version control of editable content; `.skill-tree/` is ignored by this repository's default `.gitignore`, so choose an explicit version-control policy for your own project.

Source registration and installed output are staged within the same root transaction. Rollback restores the previous installed output along with its prior source registration; previously saved user edits in the source remain preserved. The existing `recover` command handles interrupted authoring commits.
