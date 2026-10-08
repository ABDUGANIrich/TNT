# React form workflow

Use for a concrete form implementation or validation defect. Read the declared test-design prerequisite, then inspect the form's existing state and submission contract.

1. Identify which fields are required, which are conditionally visible, and which values the server accepts. Separate display strings from normalized payload values. Preserve valid zero/false values when checking emptiness.
2. Enumerate idle, editing, invalid, submitting, success, and server-error states. Decide when errors first appear and when edits clear them. Preserve entered data after recoverable failure.
3. Connect visible labels to controls and errors to their fields. On rejected submission, focus the first invalid field or an error summary with links. Avoid moving focus on each keystroke.
4. Prevent duplicate submissions while pending. Keep server validation authoritative; map field errors without dropping unknown global errors. Guard against a late response updating a replaced form.
5. Use the shared case matrix only as needed. Test the visible outcome of keyboard submission, invalid data, failed requests, retry, and success with the project's existing tools.

Deliver the implementation plus the tested payload and interaction cases. Do not introduce a form framework merely to handle a small form.
