# Progressive Skill Library

A local, npm-distributed CLI for installing a selected part of an agent skill library while preserving its original hierarchy. One generated root router describes every installed workflow. Agents can choose relevant leaves and read their instructions directly.

The command is **`skill-tree`**. The configured npm package name, **`progressive-skill-library-local`**, is provisional. Public availability and ownership have not been checked. This repository does not publish anything to npm.

Requires **Node.js 22.14.0 or newer**. Runtime uses only Node built-ins; TypeScript and Node type definitions are development dependencies. The included library has 13 original workflows across web development, databases, testing, and documentation, plus 3 supporting resources.

## Try the verified local package

From this checkout:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run verify:package
```

This creates `artifacts/progressive-skill-library-local-0.1.0.tgz`, inspects its file list, installs it into a disposable project, and exercises the installed npm command. In your own existing project, replace the quoted tarball path with its actual location:

```sh
npm install --save-dev "/path/to/progressive-skill-library-local-0.1.0.tgz"
npx skill-tree install web/react
npx skill-tree list
npx skill-tree tree
```

For one-off npx usage, without adding a project dependency:

```sh
npx --package "/path/to/progressive-skill-library-local-0.1.0.tgz" skill-tree install web/react
```

After the maintainer secures a public package name and deliberately publishes a release, the registry equivalents for the currently configured name would be `npx progressive-skill-library-local install web/react` and `npm install --save-dev progressive-skill-library-local`. These are future registry examples, not a claim that this name currently resolves to this project. If renamed, update `package.json`, regenerate the lockfile, and update these examples before release.

There are no npm lifecycle hooks. Merely installing the package does not create skills, alter host configuration, or execute skill scripts.

## Select a branch, a leaf, or everything

```sh
npx skill-tree install web/react
npx skill-tree install database/postgres documentation/architecture/decisions
npx skill-tree install web/vue/components
npx skill-tree install --all
npx skill-tree install web/react --source "./my library"
```

The last example is for a fresh installation using a custom library. One installation has one active source identity. Branch and leaf selectors are case-sensitive canonical paths, not stable IDs. Missing selectors are an error; only `--all` selects the whole library. Resources cannot be directly selected; skills declare which resources they require.

Installing `web/react` creates:

```text
.skill-tree/
  SKILL.md
  selection.json
  lock.json
  router-template.md
  navigation.md
  web/
    react/
      forms/instructions.md
      performance/instructions.md
      state/instructions.md
  testing/unit/test-design/instructions.md
  shared/forms/case-matrix.md
  shared/performance/measurement.md
```

`react` never becomes the root. `web/vue` and files merely sitting in `web/` are not copied. The testing skill and shared files are explicit dependencies; the plan names them and explains their reasons. Installing `database/postgres` later adds that path without moving the existing leaves.

## Root router and agent use

`.skill-tree/SKILL.md` is the single canonical router. It combines an authored navigation template, the complete installed hierarchy, descriptions, direct instruction paths, and explicit prerequisite links. It is deterministic, contains no timestamps or absolute machine paths, and is regenerated with each successful content change. A large map produces a configurable warning; it is never silently truncated.

For any agent that can read local files, tell it:

> Read `.skill-tree/SKILL.md` in this project, choose the workflows relevant to my task, and open their listed instructions and required prerequisites. Skip unrelated workflows.

Use several leaves for tasks spanning branches, such as implementing a React form and verifying an API error contract. Resources are templates/reference data/scripts, not automatically loaded instructions. The installer never executes their scripts.

Optional project-local Codex integration:

```sh
npx skill-tree install web/react --host codex
npx skill-tree doctor
```

This manages only `.agents/skills/progressive-skill-library/SKILL.md`, a minimal Agent Skills entry pointing to the canonical router. Internal leaves use `instructions.md` and remain outside host discovery directories. An existing unowned bridge is a conflict. `AGENTS.md` and other skills/configuration are never edited. `--host none` on a subsequent mutation removes the owned bridge.

Codex initially sees the bridge's name, description, and path. If it chooses the bridge, it reads the root router and then relevant leaves. Installing a bridge does not guarantee automatic invocation or task success. Current discovery requirements were checked against [official skill documentation](https://learn.chatgpt.com/docs/build-skills) on October 8, 2026. Automated tests check layout and content; an interactive Codex discovery session has **not** been exercised. See [host integration details](docs/hosts.md).

## Commands and state

| Command | Behavior |
| --- | --- |
| `install <path>...` | Add explicit selections and materialize their dependency closure |
| `install --all` | Select the entire source's skills, including future skills on explicit update |
| `remove <path>...` | Remove exact explicit selections; retain content still required elsewhere |
| `remove --all` | Clear selections; preserve state and unknown files |
| `update --source <directory\|bundled>` | Reconcile selection intent against an explicitly chosen content revision |
| `list` | Show installed skills and selection/dependency reasons |
| `tree` | Display the complete installed hierarchy |
| `search "form validation"` | Match all query terms against installed metadata, without opening leaf/resource bodies |
| `explain <skill-id>` | Show its path, prerequisites, dependencies, and reasons |
| `validate --source <directory\|bundled>` | Validate the entire source and all declared files without installing |
| `validate` / `doctor` | Check installed metadata, dependency closure, hashes, router, customization, and bridge |
| `stats` | Report skill/resource counts, content bytes, managed bytes, router size, and warnings |
| `recover` | Recover an interrupted transaction after its owning process exits |

`--project <directory>` uses that existing project instead of the current directory. `--json` supplies structured output. `--help` and `--version` are supported. Errors go to stderr and exit nonzero. Unknown or inapplicable flags fail rather than being ignored.

`install`, `remove`, `update`, and `recover` support `--dry-run`; plans include additions, updates, removals, dependency reasons, integration changes, and router size. Dry runs do not create locks, directories, or files. `--warn-bytes 16384` changes and persists the router warning threshold on a mutation (default 32,768 bytes).

Explicit selections are saved separately from resolved content. If `web/react` is selected, removing `web/react/forms` reports that the parent still includes it. There are no implicit exclusions. Remove the parent selection, then explicitly install the desired leaves. Overlapping explicit selections are retained individually and can be removed individually.

## Updates and ownership

```sh
npx skill-tree update --source "./my library" --dry-run
npx skill-tree update --source "./my library"
npx skill-tree remove web/react
```

Source identity, version, content revision, explicit selections, resolved metadata, dependency reasons, managed checksums, and generator version are persisted. The content revision covers the manifest and all declared files, not unlisted files. Adding selections against a changed source requires an explicit update first. A vanished selected path or invalid dependency fails before committing. Removal uses the installed snapshot and works even when the original local source is unavailable.

For a bundled source, first obtain a newer package version, then run `npx skill-tree update --source bundled`. This command does not fetch remote content, infer whether a revision is chronologically newer, or modify your npm dependency version. Choosing a different local directory with the same library ID is allowed on explicit update.

Managed files must match their recorded checksums before mutation. Save local edits elsewhere and restore the recorded version before retrying; there is no destructive `--force`. Unknown files are preserved and cannot be overwritten by newly selected content. Put navigation preferences in project-level `.skill-tree-custom.md`, then repeat an existing install selection or explicitly update to regenerate. Never manually edit the generated router or state files. Make durable instruction changes in your source library.

Changes are staged, rechecked, and swapped with a rollback backup under a project mutation lock. Detected symlinks/junctions are rejected. If a process dies, `doctor` reports the interrupted transaction; `recover --dry-run` describes recovery and `recover` rolls back or completes committed cleanup. See [transaction and recovery details](docs/architecture.md). Check `.skill-tree`, local sources, and state into version control when reproducibility across machines matters; local source locations in selection state are machine-specific.

## Authoring, scope, and evaluation

[The manifest format](docs/library-format.md) documents schema version 1, stable IDs, canonical paths, explicit instruction/resource dependencies, and authoring rules. `library/library.json` is the sole source metadata authority; instruction files do not duplicate frontmatter. The bundled example is small enough to inspect and copy into a custom source.

Selective installation reduces the **materialized library**. Selective exposure/loading can reduce the instruction content read by an agent. The npm tarball still downloads **all bundled examples**. Selective network downloading is not implemented.

The router's context cost grows with the installed catalog. The flat-catalog comparison already uses lazy instruction loading; do not compare against an artificially eager baseline. Run `npm run evaluate` to reproduce deterministic artifact sizes and five routing tasks. [Evaluation documentation](docs/evaluation.md) separates these sizes from unmeasured agent success, routing accuracy, latency, and total token cost. No model access is needed for tests or artifact generation.

The first release has no remote registry, marketplace, server, account, embeddings, automatic generation, global installations, exclusions, or host plugin framework. See [architecture and limitations](docs/architecture.md) and [release preparation](docs/releasing.md).
