# Diagnose a specific PostgreSQL query

Capture the exact query shape, representative parameter sets, table sizes, index definitions, and the observed latency distribution. Avoid using only a tiny development dataset for a production performance claim.

Read an estimated plan first when executing the query could be expensive or mutating. ANALYZE actually executes the statement; use a safe environment and transaction strategy where needed. Compare estimated versus actual rows, scan types, join choices, sorts, and buffer activity.

Distinguish a missing index from poor selectivity, stale statistics, parameter sensitivity, or an unnecessarily broad result. Propose one intervention and describe its write/storage cost. An index that speeds one query can increase write overhead elsewhere.

Use the optional measurement worksheet to compare unchanged parameters and dataset conditions. Validate both common and adversarial parameter values and confirm result equivalence. Deliver the observed bottleneck, plan evidence, change, and measured tradeoff. Do not present a guessed index as a verified performance fix.
