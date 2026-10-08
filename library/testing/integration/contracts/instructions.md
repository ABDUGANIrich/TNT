# Producer-consumer contract checks

Read the behavioral test-design prerequisite. Identify the versioned request and response boundary, its callers, and the compatibility promise. Record required/optional fields, error shapes, timeout behavior, and retry semantics.

Create fixtures representing the producer's real serialization, not an idealized in-memory object. Verify how the consumer handles additional fields, missing optional fields, incompatible required fields, and non-success status codes.

Exercise a duplicate or retried request where idempotency matters. Check that timeouts do not leave the caller unable to determine whether a write succeeded. For asynchronous contracts, specify eventual completion and observation bounds rather than fixed sleeps.

Run against a disposable real service or a faithful boundary harness. Label stub-only coverage explicitly. Deliver the contract cases and a reproducible command, including the compatibility failure they detect. Keep credentials and production data out of fixtures.
