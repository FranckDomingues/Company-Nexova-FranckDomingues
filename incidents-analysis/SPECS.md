# Nexova — Incident Analysis Specification

## 1. Objective
Analyze Nexova support-ticket CSV files locally.
Detect invalid records, calculate aggregate metrics,
display a console report, and optionally export CSV.

## 2. Source of truth
- incidents-analysis/nexova-BRIEFING.md
- incidents-analysis/incidents-nexova.csv

## 3. Input
- UTF-8 CSV with header and comma separator.
- Nine columns in the official BRIEFING.
- File path supplied as a CLI argument.
- No external AI processing of customer records.

## 4. Validation
Validate all fields and formats specified in the
BRIEFING, including:
- Unique ticket_id, matching NXV-XXXXXX.
- Valid YYYY-MM-DD date.
- Nonempty client_company.
- Category in the five allowed values.
- Description containing at least five characters.
- Agent identifier matching AGT-XX.
- Status in OPEN, CLOSED, DISCARDED.
- Email containing @.
- Satisfaction score: integer 1 through 5 if present.
- CLOSED tickets require a satisfaction score.

Report all applicable validation reasons.
Count invalid records once, even when multiple
validation rules fail.

## 5. Expected results — official sample
Total records: 100
Valid records: 96
Invalid records: 4

Categories:
TECHNICAL: 28
BILLING: 18
ACCESS: 21
HR_QUERY: 17
COMPLAINT: 12

Statuses:
OPEN: 27
CLOSED: 56
DISCARDED: 13

Invalid reasons:
Missing client_company: 1
Invalid or missing category: 1
Invalid or missing email: 1
CLOSED without satisfaction_score: 1

Satisfaction distribution:
1: 2
2: 5
3: 10
4: 22
5: 17

Average satisfaction: 3.84

## 6. Output
- Readable console summary.
- Invalid-record counts by reason.
- Category and status counts and percentages.
- Satisfaction distribution and mean.
- Interactive CSV export confirmation.
- One metric per row in results.csv.

## 7. Privacy
Never print, log, or export individual customer
email addresses or other customer-level records.
Errors must contain safe descriptions only.

## 8. Architecture
- Analysis and validation logic must be reusable.
- CLI and API must share the same business logic.
- Avoid duplication and unrelated modifications.
- Preserve existing Nexova functionality.

## 9. Acceptance criteria
- Official sample produces all expected values.
- Percentages use valid-record totals.
- Invalid records do not enter business metrics.
- Missing, malformed, and out-of-range inputs tested.
- CSV export can be read correctly.
- No sensitive information appears in outputs.
- Script handles input paths without code changes.
- Errors are clear and controlled.

## 10. Later integration
Backend:
POST /api/incidents/analyze
GET /api/incidents/results/export

Frontend:
uis/backoffice

Provide file upload, metrics display, invalid-record
summary, and CSV download.

## 11. Delivery evidence
- Test results.
- Console screenshot.
- Web interface screenshot.
- Feature branch and Pull Request.
