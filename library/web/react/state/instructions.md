# State ownership and async races

Inventory the values involved in the defect. Label each as server data, user draft, derived value, or transient presentation state. For each source value, name one owner and the events allowed to change it.

Remove copies that can be derived during render unless a deliberate snapshot is required. When a draft diverges from server data, define when it resets and how unsaved changes survive background refresh. Avoid effects that continuously copy props into local state.

For async work, model an identifiable request or cancellation boundary. Verify what happens when request B finishes before request A, a component unmounts, or the user changes the entity being edited. A stale result must not overwrite the current entity's state.

Refactor one ownership boundary at a time. Exercise a normal edit, navigation away/back, rapid consecutive requests, and a failed request. Describe the resulting ownership and reset rules; do not add a global store unless multiple independent consumers actually need shared lifetime.
