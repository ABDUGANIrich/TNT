# Local verification record

Verified on **October 8, 2026**, on Windows x64 in a workspace whose path contains an apostrophe. Temporary integration and package-test projects also contain spaces and an apostrophe.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed with TypeScript 5.9.3 |
| Production build (`npm run build`) | Passed; compiled ESM and Node shebang |
| `npm test` on Node 26.10.0 | 55 passed, 0 failed, 0 skipped |
| Same 55 tests on Node 22.14.0 baseline | 55 passed, 0 failed, 0 skipped |
| `npm run verify:package` with npm 12.2.0 | Passed npm pack inspection, clean tarball installation, and 19 packaged CLI commands |
| `npm run evaluate` | Generated deterministic flat/tree catalogs, sizes, and five routing fixtures |
| Live Codex invocation / model routing runs | Not performed |
| Linux/macOS execution | Not performed locally; CI matrix supplied |
| npm publication | Not performed |

The Node 22.14.0 Windows binary used for baseline checks was downloaded from nodejs.org and checked against that release's official SHA-256 list before execution. The baseline suite invokes the CLI using the same baseline executable, including child-process and recovery tests.

## Acceptance coverage

| Requirement | Evidence |
| --- | --- |
| Preserve selected ancestry and omit siblings/ancestor files | Branch-resolution unit tests and filesystem install assertions |
| Copy only declared dependencies and selected descendants | Dependency closure assertions, explicit file checks, inert-script fixture |
| Incremental installs and stable identities | Merge/idempotency test and dependency-path update test |
| Overlap, shared dependencies, removal intent | Overlap/removal tests and parent-selection conflict test |
| Complete deterministic router | Generated-path assertions, equivalent-order comparison, checksum/consistency checks |
| Invalid manifests fail before mutation | Validation matrix, missing-entry test, cycle install/update tests |
| Failed updates preserve usable installation | Vanished-selector and cycle update tests followed by doctor |
| Preserve local modifications and unknown files | Managed-file, bridge, unknown-file, and future-resource collision tests |
| Reject traversal and symlink escapes | Portable-path matrix, tampered lock test, Windows junction tests for source/install/host paths |
| Dry runs write nothing | Full file/directory snapshots around install/remove/update/recover plans |
| No script execution during installation | Copied executable resource attempts a sentinel write if run; sentinel remains absent |
| Portable project path handling | Tests and package checks use spaces/apostrophes without shell interpolation |
| Runtime tarball completeness | Explicit allowlist, manifest-file inclusion, shebang/bin and zero-runtime-dependency checks |
| Installed package works without dev tools | Clean npm installation and offline npm exec against the installed command |
| One intended host entry | Structural count/frontmatter/path assertions and no leaf discovery entries |
| Recoverability and concurrency | Fault injection at four commit stages, process termination/recovery, live mutation and recovery guards |

`artifacts/package-verification.json` records the actual packed file list, npm integrity hash, runtime/platform, and exercised commands for the final local tarball. `artifacts/evaluation/sizes.json` records artifact bytes and explicitly labeled token estimates. Those reports are generated artifacts, excluded from the npm package and source control by default.

Structural host checks are not proof of actual host discovery, implicit selection, or task success. The manual host procedure and reproducible agent-run evaluation are documented separately in `hosts.md` and `evaluation.md`.
