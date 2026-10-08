# Persisted-data change gates

Before preparing a schema or data migration, identify affected readers/writers, data volume, deployment order, and the system's existing migration mechanism. Separate reversible schema changes from irreversible transformations or deletions.

Define an invariant that can be checked before and after the change, such as row counts, uniqueness, nullability, or referential consistency. Specify how a failed batch is detected and restarted without double-applying effects.

Write the compatibility window: which old and new application versions must coexist? Prefer an expand/backfill/switch/contract sequence when a single-step change would break running readers or writers. State the rollback boundary and when restoring data would require a backup rather than reversing DDL.

Use a disposable database or representative staging copy to rehearse. Identify stop conditions such as lock waits, unexpected row counts, or constraint violations before execution. Deliver a migration plan with validation queries and rollback/recovery steps. Preparing the plan is not authorization to mutate a production database.
