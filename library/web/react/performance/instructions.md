# Diagnose one slow React interaction

Start with a reproducible interaction and a user-visible metric: input delay, commit duration, or time until results appear. Record dataset size, build mode, browser, and hardware class in the optional measurement worksheet.

Capture a baseline profile before changing component boundaries. Distinguish JavaScript computation, network waiting, layout work, and React commits. For repeated renders, trace the changing prop or context value to its owner; a render count alone does not establish a performance problem.

Try the smallest justified intervention: move transient state closer to its consumers, derive redundant state, stabilize a genuinely expensive calculation, or reduce rendered rows. Memoization requires evidence of costly repeated work and stable dependencies. Check whether the fix retains stale closures or grows memory.

Repeat the same interaction and dataset under comparable conditions. Report baseline and changed measurements, visible correctness checks, and uncertainty. If the bottleneck is elsewhere, document it and stop changing React code. Do not claim an improvement from a development-only render counter.
