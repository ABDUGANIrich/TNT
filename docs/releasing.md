# Build and release preparation

The configured name `progressive-skill-library-local` is provisional. No ownership or registry availability has been assumed. Before any future publication, choose an owned public/scoped name, update metadata/examples/lockfile, review the license and examples, and obtain explicit publication authorization. This task never publishes.

Use Node.js 22.14.0 or newer:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run evaluate
npm run verify:package
```

`verify:package` invokes real `npm pack --json`, checks the returned file manifest against the allowlist and declared runtime content, saves the tarball under `artifacts/`, and installs that exact tarball in a clean temporary project with no development tools from this package. It exercises the generated npm bin through `npm exec --offline -- skill-tree`, including dry-run, selective install, incremental install, idempotency, inspection, update, removal, and Codex bridge structural checks. Temporary paths contain spaces and an apostrophe. Its report is `artifacts/package-verification.json`, including npm's SHA-512 integrity value, full tarball file list, sizes, platform/runtime, and commands.

The tarball allowlist contains compiled `dist/`, `library/`, `templates/`, `docs/`, README, LICENSE, and npm's package metadata. It excludes source/tests/scripts/node_modules/artifacts. The compiled bin retains its Node shebang; npm creates the platform command shim. Runtime has no dependencies and no compilation requirement in the consuming project. The package carries the whole example library even when the CLI materializes only a branch.

There is deliberately no `prepare`, `postinstall`, or other npm lifecycle hook. Maintainers must build explicitly before packing. The verifier catches missing runtime files; use it rather than packing an unbuilt checkout. GitHub Actions is configured for Linux, macOS, and Windows on the Node baseline and Node 24; local execution does not establish that hosted jobs passed.

After changing source examples, regenerate the evaluation artifacts, update documented size results, rerun tests/package verification, and inspect the release tarball. Never use `npm publish` as a verification step.
