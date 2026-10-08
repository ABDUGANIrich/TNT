# Form case worksheet

| Field or event | Input/state | Expected result | Focus destination | Announcement | Test evidence |
| --- | --- | --- | --- | --- | --- |
| Required field | Empty on submit | Field error, no request | First invalid field | Actionable correction | |
| Submission | Pending | Duplicate request prevented | Preserve focus | Pending state | |
| Server failure | Valid submitted values | Data preserved; retry available | Error summary if needed | Failure and recovery | |
| Success | Accepted request | Confirm saved result | Next logical task | Success | |

Adapt rows to the actual contract. This is a supporting worksheet, not prerequisite instructions.
