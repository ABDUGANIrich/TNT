# Architecture, state, and recovery

`source.ts` loads bundled/local content into a validated source snapshot. It is separate from installation and performs no network access. `manifest.ts` defines validation; `selection.ts` preserves explicit path intent; `dependencies.ts` calculates the installed closure and reasons. `planner.ts` creates desired files and a reviewable diff. `filesystem.ts` owns locking, staging, commit, and recovery. `router.ts` renders the deterministic catalog. `host.ts` generates one Codex bridge. `state.ts` checks the persisted installation. `service.ts` orchestrates mutations; `cli.ts` handles argument validation and presentation.

## State

| File | Role |
| --- | --- |
| `.skill-tree/selection.json` | Source locator/identity/version/revision, exact explicit selectors, host setting, warning threshold |
| `.skill-tree/lock.json` | Schema/generator versions, installed manifest snapshot, dependency reasons, managed file SHA-256 hashes, bridge path/hash |
| `.skill-tree/SKILL.md` | Canonical generated navigation and complete catalog |
| `.skill-tree/router-template.md` | Locked snapshot of the packaged navigation template |
| `.skill-tree/navigation.md` | Locked snapshot of the separate user customization used for generation |
| `.skill-tree-custom.md` | Optional user-owned customization input outside the managed root |

The lock lists every owned root file except itself, since a file cannot contain its own checksum. Its metadata is structurally validated and checked against the selection closure, expected file set, dependency reasons, router generation, and host bridge. This detects inconsistency; it is not a signature or protection against an attacker who rewrites both metadata and content. Back up/version control the installation. `search` validates metadata and file existence without opening leaf/resource bodies; use `doctor` for full checksum verification. Other installed inspection commands verify content hashes before displaying a healthy catalog.

The source revision hashes canonical parsed manifest JSON and sorted declared file checksums. Source byte formatting outside parsed JSON does not affect revision. Array order can affect revision; semantic canonicalization beyond this is not promised. Unlisted files are excluded. One installation may change the locator of the same source ID through update, but cannot silently switch library identities.

## Mutation protocol

1. Acquire `.skill-tree-mutation.lock` exclusively using `wx`. Its PID identifies the owner. Reject a concurrent command or unresolved journal.
2. Read and validate the old installation; reject modified/missing managed files and unsafe links. Load/validate the full desired source and selection closure. Detect unowned-file or host-entry collisions.
3. Stage a complete directory under `.skill-tree-transaction/stage`. Preserve unknown files and unchanged file timestamps, remove only owned obsolete files, and write desired content. Scripts are never imported or run.
4. Recheck live file hashes and the affected bridge, then durably write a journal containing before/after snapshot digests and old/new bridge bytes.
5. Rename the old root into the transaction backup and rename the staged root into place. Replace the bridge through a staged file rename if required.
6. Atomically mark the journal committed, then remove staging/backup data and release the mutex. Exact repeated operations do not rewrite the root.

Failures before the commit marker attempt rollback. Tests inject exceptions after staging, backup, root replacement, and bridge integration, and terminate a child process after replacement. Root/bridge consistency and unknown content preservation are asserted after recovery.

## Recovering an interrupted process

```sh
npx skill-tree recover --dry-run
npx skill-tree recover
npx skill-tree doctor
```

Normal commands refuse to proceed while a lock or transaction remains. Recovery refuses if the recorded process is alive (including conservative refusal after PID reuse). Once it is dead, recovery can remove its stale lock. A prepared journal restores the previous root/bridge; a committed journal completes cleanup. A pre-journal staging directory can be discarded because no root mutation occurs before a durable journal.

Recovery checks digests before removing or restoring a tree. If the live tree, bridge, or backup changed after interruption, it stops instead of deleting those edits. Save edited files elsewhere, inspect `journal.json` and `backup`, and restore the recorded pre/post state before retrying. A missing or invalid recovery journal that cannot establish a safe action needs manual inspection. Never remove an active process's mutex blindly.

Recovery itself acquires `.skill-tree-recovery.lock` to serialize stale-lock reclamation. If a recovery process dies, inspect that guard's PID and verify that no skill-tree process is running before manually removing the guard and retrying recovery. This conservative refusal avoids two simultaneous recoveries reclaiming each other's active locks.

## Limits and decisions

- Node 22.14.0 is the baseline; the package is ESM. Runtime has zero third-party dependencies. Current local verification results are in `docs/verification.md`; the CI matrix is a portability check to run, not evidence that hosted CI already passed.
- All installations are project-local at a fixed `.skill-tree` path. One active source, no subtree exclusions, no global mode, no package-managed remote fetching, and no multiple-source merge semantics.
- A mutation copies the existing tree and holds source/content snapshots in memory. Disk work and memory scale with materialized content; hashing also costs linear I/O. This is appropriate for modest text-heavy libraries, not multi-gigabyte assets. Source validation loads even unselected declared files. Router context cost grows with catalog size.
- File ownership is tracked by path/checksum. Symlinks/junctions in checked paths or managed trees are refused. No attempt is made to follow arbitrary links or support network filesystem guarantees. Cooperative CLI concurrency is locked; a hostile process changing path components between checks is outside this portable filesystem threat model. Run in a trusted project directory.
- The root swap is recoverable, not a multi-path atomic database transaction. There is a short window between root renames and between root/bridge replacements; readers should not run concurrently with mutations. CLI readers refuse the mutex. External hosts do not honor it. Durable file writes and recovery target process interruption; sudden power-loss guarantees vary by filesystem because directory fsync is not portable across supported platforms.
- Unknown regular files are retained. Unknown symlinks cause refusal. Case-fold collisions are rejected for portable manifests. No force overwrite, automatic local-edit merge, or destructive repair mode is provided. `remove --all` intentionally keeps metadata and any user files.
- Local source paths in state are absolute so future installs can find the source; routers remain machine-independent. To move projects across machines, explicitly update using the same source ID at its new path. Sources are trusted content, not authenticated packages.
- Stable IDs survive source path changes, but explicit selections remain path-based. A removed selected leaf/branch fails update. Re-select intentionally using the prior source before migrating. Source versions are labels; explicit update may also intentionally restore an older revision.
- Host structural verification is separate from actual host invocation and routing evaluation. No agent-run success, latency, or total-token claims have been measured.
