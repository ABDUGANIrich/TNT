# Tests from a behavior contract

Write a short contract describing valid inputs, observable outputs, and failure behavior. Identify the boundary controlled by this unit and dependencies whose behavior belongs in integration tests.

Partition inputs into materially different cases: ordinary values, empty or missing values, boundary values, invalid types or states, and repeated calls. For stateful behavior, include at least one meaningful transition and failure recovery. Select cases that could expose a distinct defect rather than many equivalent examples.

Assert externally meaningful results and side effects. Control time, randomness, and external responses through narrow seams already supported by the design. Avoid duplicating the implementation's algorithm as the expected result.

For a bug fix, demonstrate that the test fails against the prior behavior and passes with the fix when practical. Keep fixtures readable and minimize setup unrelated to the contract. Report what failure modes the tests cover and which require integration or manual checks.
