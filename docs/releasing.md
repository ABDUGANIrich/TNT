# Build and release

The release package is `@dev_abdugani/tnt-skills`; its executable is `skill-tree`. Publishing is a separate, deliberate maintainer action. None of the verification commands publish, log in, or change npm account settings.

## Verify a release

Use Node.js 22.14.0 or newer, from the repository root:

```sh
npm ci --ignore-scripts
npm run verify:release
```

Stop if any command fails. The release check runs type checking, the complete unit/integration suite, evaluation artifact generation, the npm dependency audit, and package verification. GitHub Actions runs the same check on Linux, macOS, and Windows with Node 22.14.0 and Node 24. Confirm those jobs pass before claiming cross-platform verification. A live Codex discovery/leaf-loading check is separate; see `hosts.md`.

`verify:package` builds, invokes real `npm pack --json`, checks package/lockfile name and version consistency, rejects placeholder release names, checks the returned file manifest against the allowlist and runtime content, saves the tarball under `artifacts/`, and installs that exact tarball in a clean temporary project with no development tools from this package. It exercises the generated npm bin through `npm exec --offline -- skill-tree`, including dry-run, selective install, incremental install, idempotency, inspection, update, removal, Codex bridge structural checks, external frontmatter imports, customization, and source syncing. Temporary paths contain spaces and an apostrophe.

The report is `artifacts/package-verification.json`, including npm's SHA-512 integrity value, full tarball file list, sizes, platform/runtime, and commands. Package verification clears any old report before starting so a failed packaging attempt cannot leave its prior success report behind. Do not publish after a failed check or after changing release inputs; rerun verification first.

The tarball allowlist contains compiled `dist/`, `library/`, `templates/`, `docs/`, README, LICENSE, and npm's package metadata. It excludes source/tests/scripts/node_modules/artifacts. The compiled bin retains its Node shebang; npm creates the platform command shim. npm installs the pinned runtime `yaml` dependency; consumers need no compiler or development dependencies. The package carries the whole example library even when the CLI materializes only a branch.

There are no `prepare`, `postinstall`, or other npm lifecycle hooks. Maintainers must build before packing; use the verifier rather than packing an unbuilt checkout. Review the complete tarball contents and license before publication. Source review should be committed so the released version can be traced to a revision.

## Publish the verified artifact

In PowerShell, read the latest successful report rather than reusing a previous session's `$tarball` variable:

```powershell
$release = Get-Content './artifacts/package-verification.json' -Raw | ConvertFrom-Json
$tarball = (Resolve-Path (Join-Path './artifacts' $release.tarball)).Path
$release | Select-Object package, version, tarball, sha512Integrity
tar -tf "$tarball"
npm publish "$tarball" --access public --dry-run
```

The package must be `@dev_abdugani/tnt-skills` at the intended version. Review the dry-run output. To publish, authenticate as an owner of that scope and complete npm's authentication prompts:

```powershell
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish "$tarball" --access public --registry=https://registry.npmjs.org/
```

Only the final command uploads the package. Then install the published version in a separate empty project and run `skill-tree install web/react --host codex`, `skill-tree doctor`, and the manual host check. Publishing does not establish host discovery or routing accuracy.

## Later releases

Bump the package and lockfile together with `npm version patch --no-git-tag-version` (or the appropriate minor/major bump). Update versioned documentation/examples, run the release check, commit and tag the release revision, and publish its newly verified tarball. The version test reads `package.json`, so it follows the release version. Published name/version combinations cannot be reused.

After changing source examples, regenerate the evaluation artifacts, update documented size results, and rerun the checks. Dependency audit results describe the registry advisories available at verification time and should be refreshed for each release.
