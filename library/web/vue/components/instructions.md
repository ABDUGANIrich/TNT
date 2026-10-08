# Vue component contract

Identify the component's callers and the variability they need. Express inputs as props, notifications as emits, and caller-owned markup as slots. Document whether an input is controlled by its caller or held as an internal draft.

Trace a full update round trip: caller value, rendered control, user event, emitted payload, caller update. Do not mutate a prop or silently couple a reusable component to a specific route or store. If an object prop can be mutated indirectly, establish an explicit update event instead.

Choose defaults for absent optional props and define the empty/loading/error states. Prefer a small set of meaningful variants over many independent booleans that permit contradictory states.

Check at least two realistic call sites and keyboard interaction for interactive components. Test emitted payloads and rendered behavior rather than private reactive variables. Finish with usage examples that show ownership and one error or empty case. Match the Vue version and conventions already present in the project.
