# Date, instant and time-zone contracts

Classify each temporal field exactly once. A calendar day, point in time and naive local wall time are different contracts.

| Meaning                                        | Wire contract                                                                   | Interpretation                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Instant: creation, expiry, scheduled timestamp | RFC 3339 date-time with seconds and `Z` or explicit offset; OpenAPI `date-time` | Store/compare as an instant                             |
| Calendar day: birthday, service/business date  | A real `YYYY-MM-DD` day; OpenAPI `date`                                         | Preserve the day independently of server/browser offset |
| Local wall time, today/month/local-day bounds  | Explicit IANA zone and required date/time context                               | Intended user/workflow/organization context             |

Use installed `z.iso.datetime({ offset: true })` or `z.iso.date()` support where applicable, or canonical equivalent fallback validators. Never parse a naive string as an instant without its required zone. Pass zone context explicitly and use the local missing-zone contract rather than guessing the server's or a hard-coded zone.

Send instants with an offset and display in the intended viewer's zone. Construct calendar-day strings from the control's local parts; `toISOString()` on local midnight can shift the day. Decode date-only values through canonical helpers, not `new Date('YYYY-MM-DD')` followed by a local formatter. A stored calendar day returns the same string.

Timestamp filters turn the intended local-day bounds into instants with DST-aware arithmetic; date-only filters send date-only bounds. Compare instants numerically across offsets. Format mail/document output explicitly for the recipient's locale and intended zone. User and organization business calendars may differ; follow the local domain contract.

Verify invalid/leap dates, accepted/rejected offset forms, round trips, east/west of UTC, DST-dependent bounds and missing zone when affected. Restore clock/zone overrides between tests. Do not change a scheduler's wall-time semantics incidentally while fixing display.
