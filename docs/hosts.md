# Host discovery and selective loading

The generic contract is local-file access: explicitly ask the agent to open `.skill-tree/SKILL.md`, match descriptions to the task, and read selected instructions. The router gives relative paths anchored to its own directory. It includes explicit prerequisite links and labels resources separately. Host instruction precedence and user requests still apply.

## Codex project adapter

Official requirements were read on **October 8, 2026** from [Build skills](https://learn.chatgpt.com/docs/build-skills) (the former `developers.openai.com/codex/skills` URL redirects there):

- Repository discovery uses `.agents/skills` between the working directory and repository root.
- A host-facing skill uses `SKILL.md` with `name` and `description` frontmatter.
- Initial discovery uses metadata; full instructions are read when a skill is selected. Explicit invocation is available. Implicit activation depends on matching and host policy.

`--host codex` writes one entry at `.agents/skills/progressive-skill-library/SKILL.md`. Its description lists broad installed top-level areas; its body points to `.skill-tree/SKILL.md`. There is no full duplicate tree in the bridge. Host-facing metadata is derived from installed metadata, not maintained separately.

The normal loading sequence is:

1. Host discovers the single bridge's metadata.
2. Agent chooses or is explicitly asked to use the bridge.
3. Agent opens the canonical root catalog.
4. Agent opens matching leaves and required instruction prerequisites, then supporting files only as needed.

If the host does not pick the bridge, explicitly ask it to read the root. Refresh/restart the host if discovery has not updated. Installing files alone cannot guarantee implicit invocation. Global host configuration, other projects, duplicate skill names elsewhere, and disabled skills can affect runtime behavior.

## Verification boundary

Automated tests check that there is exactly one discoverable entry created by this adapter, valid frontmatter, the correct relative root target, and no independent internal leaf registration. They also check ownership conflicts, modified bridge detection, transaction rollback, and preservation of unrelated `AGENTS.md` content.

**Not verified:** a live interactive Codex session discovering this generated entry, its initial prompt, automatic selection, leaf-loading traces, or successful task completion. There are no other host-specific adapters in this release.

Manual host check: in a disposable Git repository, install `web/react --host codex`, start Codex there, inspect `/skills`, explicitly invoke `$progressive-skill-library`, and ask for a form-validation plan. Record which files are opened. Confirm only the bridge was initially advertised and the root/required test-design leaf were read on demand. Try an unrelated translation task and verify that no skill body is loaded. Do not report this procedure as completed until actual host evidence exists.
