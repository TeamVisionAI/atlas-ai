# BR-192 — Terminal Prospect Close Cancels Follow-ups

## AI Summary

When a prospect is dispositioned as Not Interested, Disqualified, Do Not Contact / Unsubscribe, or another Atlas terminal close, Atlas cancels that prospect’s open follow-up obligations in domain logic. History is kept. Follow-ups Active / Due Today is based on OPEN status plus due date — not due date alone.

## Purpose

Keep prospect lifecycle and follow-up lifecycle consistent after Mission Control Close — Not Interested and other shared terminal closes.

## Status

Approved — V1 implemented.

## Business Rules

See [BUSINESS_RULES.md](./BUSINESS_RULES.md) BR-192.

Terminal milestones: `CLOSED`, `DO_NOT_CONTACT`.

Close reasons:

- `prospect_closed_not_interested`
- `prospect_closed_disqualified`
- `prospect_closed_do_not_contact`
- `prospect_closed_unsubscribe`
- `prospect_closed_already_working`
- `prospect_closed_unable_to_contact`

## Technical Notes

`advanceProspectWorkflow` calls `cancelOpenFollowUpsForClosedProspect` after a successful persist to `CLOSED` or `DO_NOT_CONTACT`. That is the shared path used by Mission Control `saveConversationOutcome` (Not Interested) and canonical interview outcomes (Not Qualified, Not Interested, Unable to Contact, Already Working).

Conversations inbox close with `NOT_INTERESTED` or `DO_NOT_CONTACT` also cancels open follow-ups.

BR-178 recycle: after existing OPEN rows are cancelled, interview `not_interested` with an explicit future date may create a new recycle follow-up. Mission Control Close — Not Interested does not supply that date.

Reopen / reactivate does not recreate the cancelled row.

## API

N/A — no new endpoints. Existing `GET /api/follow-ups` already excludes CANCELLED from Active (view status `completed`).

## Database

No migration. Uses `atlas_follow_ups.status = CANCELLED` and `history[].reason`.

## Related Documents

- [BR-178-follow-up-engine-v2.md](./BR-178-follow-up-engine-v2.md)
- [BUSINESS_RULES.md](./BUSINESS_RULES.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-08-31 | Terminal close cancels OPEN follow-ups in domain logic; UI-only hiding is not sufficient. |

## Migration Notes

Existing OPEN follow-ups for already-closed prospects can be repaired with:

`node backend/dev/tools/repairStaleFollowUpsForClosedProspects.js --organization-id <uuid>`

Dry-run by default. `--apply` writes cancels. BR-178 `outcome:not_interested` recycle rows are kept.
