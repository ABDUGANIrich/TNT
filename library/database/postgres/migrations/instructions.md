# Stage a PostgreSQL schema change

Read the database change-safety prerequisite. Locate the project's migration conventions and deployed PostgreSQL version; check that any proposed DDL is supported there.

For a renamed or transformed field, plan additive schema first, compatible writes, resumable bounded backfill, read cutover, and later cleanup. Define batch keys and progress tracking so a retry neither skips nor duplicates rows. Avoid treating a large table rewrite as a trivial deploy step.

Identify lock requirements and whether each operation can run inside the migration framework's transaction. Choose timeout and observation policies appropriate to the target environment; do not invent universal safe timings.

Rehearse forward migration from realistic old data. Check constraints and both old/new application compatibility during the transition. Rehearse the supported rollback or document why data restoration is required. Include a failure between batches. Deliver migration files, validation queries, deployment ordering, and stop conditions; do not execute against production implicitly.
