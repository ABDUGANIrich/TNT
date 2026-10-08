# Form access audit

Scope the audit to a named form and its success/error paths. Inspect the rendered controls, not only component source. Use the shared case matrix if recording several fields.

Walk the form with keyboard input alone. Confirm a logical focus order, visible focus, an accessible name for every control, and usable native submit behavior. Group related choices and explain constraints before submission when possible.

Trigger missing, malformed, and server-rejected input. Confirm errors identify the affected field, are programmatically associated with it, and give a concrete correction. Check that an error summary links to fields and is reachable. Announcements should communicate a changed status without repeatedly reading the whole form.

Verify that pending submission is conveyed and that retry preserves entered values. Test at increased zoom and with long labels or messages. Automated checks can find some structural defects; separately record keyboard and assistive-technology checks actually performed. Deliver observed failures, fixes, and remaining unverified interaction paths.
