# Catalog sizes and routing evaluation

Run `npm run evaluate` to build and produce `artifacts/evaluation/tree.md`, `flat.md`, `sizes.json`, and `tasks.json`. The source revision is recorded. Output has no timestamps or machine-specific paths and is reproducible for unchanged inputs.

Both catalogs use the same 13 skills, 3 resources, navigation rules, direct paths, and prerequisite section. The tree representation includes branch descriptions and indentation; the flat representation uses a row for each skill/resource. Neither loads full instructions eagerly. This is a comparison of these concrete representations, not proof that hierarchy is more compact than every possible flat catalog.

Measured for the bundled initial fixture:

| Artifact | UTF-8 bytes | Unicode code points | Estimated tokens |
| --- | ---: | ---: | ---: |
| Tree router | 5,375 | 5,337 | 1,335 |
| Flat catalog | 5,177 | 5,145 | 1,287 |
| Full skill instructions (separate files) | 14,471 | Not measured | Not measured |

Token estimates use `ceil(Unicode code points / 4)`, **not a tokenizer**. Actual model tokenization will differ. The tree is larger for this fixture. These are deterministic artifact sizes, not total prompt/task cost, latency, routing accuracy, or task success results. **No agent runs have been performed.**

## Reproducible optional agent runs

The five tasks in `evaluation/tasks.json` cover a clear single-skill request, ambiguity, multiple branches, no relevant skill, and a prerequisite chain. Expected and acceptable skill IDs are a grading fixture, not instructions to give the agent.

1. Generate artifacts and record the source revision, package version, host/version, model identifier, settings, and tool configuration. Freeze those inputs for both variants. Use a local model or an already-authorized provider; normal tests require no model access or paid service.
2. Create a fresh isolated working directory for every task/variant/repetition. Provide identical copies of the underlying `library/` leaf/resource files. Present exactly one catalog as initial discovery context, with the same task and host instructions. Keep expected IDs/grading text hidden from the agent.
3. Ask the agent to select applicable workflows, read required instructions using observable file-read tools, and outline how it would approach the task. For the ambiguous case, a clarification before leaf selection is acceptable. This routing-only phase does not measure implementation success.
4. Alternate or randomize variant order with a recorded seed and use multiple repetitions. Log the full file-read sequence, selected IDs, prerequisite ordering, unrelated reads, clarification behavior, elapsed time, and provider-reported usage if available. Capture the raw trace so graders can distinguish stated intentions from actual reads.
5. Grade required/allowed selections and prerequisites using the fixture. Report per-task outcomes and failure examples, plus aggregate precision/recall only with the chosen ambiguity policy disclosed. For the no-skill task, check zero instruction-body reads. A resource read is not an instruction-prerequisite read.
6. Report initial-catalog size separately from total input/output/cached tokens, tool-output tokens, and wall time. If using a tokenizer, record its package/version/encoding; otherwise label all counts estimates. Include failed runs in totals and do not infer latency from catalog bytes.
7. To measure actual task success, add versioned runnable project fixtures and independent acceptance checks for implementation tasks, then rerun both variants from clean starting states. The provided routing fixture alone cannot establish task success.

Suggested raw result fields: `taskId`, `variant`, `repetition`, `sourceRevision`, `hostVersion`, `model`, `settings`, `readPaths`, `selectedSkillIds`, `prerequisiteOrderValid`, `clarified`, `graderNotes`, `elapsedMs`, `usage`, and `tracePath`. Keep outputs outside the fixture so unmeasured expectations cannot be confused with measured results.
