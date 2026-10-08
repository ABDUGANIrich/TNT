# Write a recoverable incident procedure

Choose one observable failure, such as a stuck queue or an unhealthy deployment. Define entry symptoms, relevant dashboards/logs, and how to distinguish nearby failure modes. List the access and tools required before the procedure starts.

Separate diagnosis commands from state-changing recovery commands. For each recovery action, describe expected output, verification, stop conditions, and how to undo or escalate it. Use explicit placeholders for environment names; do not insert plausible production identifiers.

The optional JSON shape helper reports top-level keys from a local sample without printing values. Read its source before choosing to run it; it is not required for the runbook and installation does not execute it.

Rehearse the steps in a disposable environment or mark them untested. Ensure a failed step does not encourage blindly continuing. Finish with service restoration checks, evidence to retain, and escalation criteria. Deliver a procedure an operator can follow without the author present, with tested and unverified steps distinguished.
