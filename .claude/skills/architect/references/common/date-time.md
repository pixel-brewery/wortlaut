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

## Angular browser applications

The browser determines the viewer's IANA zone. Pass it through the owned transport/interceptor when the API needs that context, using its actual header or field contract; never hard-code a user zone or treat a server default as the viewer's choice. An organization's stored business-calendar zone remains a separate concern.

Send a point in time with `Date.toISOString()` or the canonical instant helper and display it with Angular `DatePipe` in the browser zone, without a fixed timezone argument. Use `DecimalPipe`, `CurrencyPipe`, `PercentPipe` and other standard pure Pipes for ordinary display; formatting helpers do not belong on a ViewPresenter.

For a calendar day, derive `YYYY-MM-DD` from the date control's local year/month/day. Load it through the canonical day-to-control adapter. For display, compose the project's verified `calendarDate` Pipe with `date: 'mediumDate'`, without a timezone argument. Do not pass a raw date-only string directly to the date Pipe, construct `new Date(value)` for local display, serialize the control's local midnight as an instant or force `'UTC'` as a workaround. The Pipe is a project rendering adapter, not an invented Angular or Mosaik built-in. The services guide identifies available [public ngpel helpers](angular-services.md); use the consuming project's verified facade where its contracts differ.

Day filters on instant fields send DST-aware start/end instants for the selected browser-local day; filters on date-only fields send date-only bounds. Compare instant values numerically across offsets. Exercise date-sensitive form/presenter behavior in zones east and west of UTC and at affected DST boundaries, restoring `TZ`/clock state afterwards. Retain the project's actual temporal lint/catalog enforcement and add newly classified fields to its maintained registry when one exists.
