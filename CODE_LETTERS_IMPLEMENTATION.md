# Fixed code letters and atomic swap

Status: implemented in this working tree, 2026-10-21. Not applied to staging or production.

## Behavior and business rules

- A verified, non-rejected entry can receive a manual A-Z letter before drawing.
- Manual assignments persist as `registrations.code_letter_fixed = true`. Draw and Redraw preserve them. Existing assignments are not retroactively classified as manual.
- Editing an occupied letter previews a swap. Saving changes both registrations atomically and fixes both resulting assignments for future draws. An entry without an existing letter must select an unused letter.
- Partial draws preserve every existing assignment. Explicit redraws redraw only non-fixed assignments. If all entries are fixed, redraw is a successful no-op. Reserving D or Z does not skip the other available letters.
- Both sides of a manual swap are checked for overlapping-event letter conflicts, including participant and group-member registrations. Either failure rolls back the whole swap. Letter changes do not resolve the underlying schedule overlap.
- Draw retains the existing best-effort conflict fallback if no fully safe permutation exists; the response/UI now explicitly reports remaining conflicts. Fixed letters and uniqueness are still preserved.
- Existing verification, rejection, admin/PIN scope and shuffle-lock rules remain. Clearing a letter also clears its fixed flag. Rejecting/unverifying an entry follows the existing workflow.
- A separate restriction after judging starts is BUSINESS DECISION REQUIRED; no new judging-start policy was introduced. The existing shuffle lock remains authoritative.

## Data and API flow

`Assign/Edit → preview target and old letters → scoped RPC → festival/item advisory locks → locked schedule/registration rows → revalidate scope, lock and expected assignment → conflict checks → one UPDATE → per-registration audit → invalidation hint → authorized refetch`.

The source of truth remains `registrations.code_letter`; marks/results retain their registration IDs. No scores, ranks, ownership, participant IDs or judge submissions are reassigned by the database edit.

New RPCs:

| RPC | Access and purpose |
| --- | --- |
| `stage_edit_code_letter` | Authenticated existing admin check; requires expected old letter and expected target registration ID |
| `stage_draw_code_letters` | Authenticated existing admin check; atomic fixed-preserving draw |
| `stage_venue_portal_edit_code_letter` | Existing venue PIN validation, then the same edit rules |
| `get_stage_management_registrations_with_letters` | Existing scoped admin reader, enriched with fixed state |
| `stage_venue_portal_data_with_letters` | Existing PIN reader, enriched with fixed state and original row order |

`stage_venue_portal_draw_letters` keeps its signature and delegates to the shared fixed-preserving draw. Original table-returning reader signatures remain. The frontend retains the scoped/legacy admin read fallbacks for older deployments; new writes require the new migrations. Private helpers have no client schema/function access. No new table privileges or RLS policies are added.

Only ID, letter and fixed state are returned for edited rows. Audit records retain before/after values for both registrations.

## Consumers and refresh

| Consumer | Refresh behavior |
| --- | --- |
| Venue PIN portal | Venue hint refetches the same PIN-authorized reader |
| Admin stage management and schedule lists | Festival hint invalidates registration-label consumers |
| Admin code-letter, marks and results screens | Schedule hint refreshes schedule registrations |
| Active judge session | Schedule hint reuses the token-bound reader and changes labels only; active registration, mark drafts and sync queue stay attached to their IDs |
| Announcer details | Open details refetch using the existing result reader |

The statement trigger sends empty Broadcast invalidation hints for the affected festival, schedule and venue. It sends one hint per topic for a multi-row update. Supabase may add its own message ID; no row data, names, letters, PINs or judge tokens are broadcast. Public hints convey no authorization: each consumer refetches through its existing access checks. An untrusted hint can only request a refetch.

Subscriptions are shared per topic, row events are debounced, and reconnect/foreground refreshes recover missed updates. No periodic polling was added. Cache invalidation excludes marks/scores and narrows schedule/festival/venue readers where possible. Result modals resolve the current letter by registration ID. Label-only refreshes do not reset result bracket input or rerun rank calculation over unsaved result edits.

Already downloaded PDFs/printouts remain snapshots; newly fetched displays/exports read current data.

## Files

- `src/components/stage/StageVenuePortal.tsx`: Assign/Edit, preview, fixed label, fixed-preserving draw and compact modal.
- `src/app/(admin)/stage-management/[id]/code-letter.tsx`, `src/app/(admin)/schedule/[id]/code-letter.tsx`: matching admin edit/draw behavior.
- `src/services/stageManagementService.ts`, `src/services/participantService.ts`: versioned read/edit RPCs and server-side operational draws.
- `src/core/hooks/useParticipants.ts`, `src/core/hooks/useStageManagement.ts`: mutation and subscription wiring.
- `src/core/hooks/useCodeLetterUpdates.ts`, `src/core/utils/invalidateCodeLetters.ts`, `src/core/utils/codeLetters.ts`: shared refresh and preview behavior.
- `src/app/judge/marks.tsx`, `src/app/(admin)/schedule/[id]/results.tsx`, `src/app/(admin)/smart-announcer/index.tsx`: refresh labels without transferring work to another registration.

## Migrations and rollout

1. `20261021060506_fixed_code_letters_and_atomic_swap.sql`
2. `20261021060510_code_letter_change_notifications.sql`
3. `20261021060616_code_letter_operational_reads.sql`

Apply the reviewed migrations to the confirmed intended project before releasing the frontend. Existing assignments keep their values and start non-fixed. Existing active clients must reload to use the new edit/draw RPCs. Legacy direct-table/old manual-write clients do not provide the new stale-edit guarantees.

The source and migrations were pushed to staging Git `main` in commit `fa0a535`. No migration has been applied to Staging or Production, and no deployment was performed. Pre-existing unrelated dirty changes were preserved.

## Validation and limits

VERIFIED FROM REPOSITORY / ISOLATED RUNTIME:

- `node tests/code-letters-db.cjs`: 39 assertions, all three migrations executed on an isolated PostgreSQL 15 contract fixture; a two-session test additionally proves the stale writer actually waits and is then rejected, leaving unique fixed assignments. The fixture mocks existing authorization/PIN/Realtime dependencies; it is not a full Supabase schema replay or a PIN-rate-limit test.
- `node --test tests/code-letter-updates.test.cjs`: shared subscriptions, event debounce, reconnect/foreground refetch and cleanup.
- `node tests/code-letters-browser.cjs`: synthetic RPC UI test for direct assignment, draw/redraw preservation, swap preview/payload, stale-save error, locked and empty states. Modal screenshots checked at 320, 375, 768, 1024 and 1440 pixels. External API requests are blocked; no real account is used.
- `node --test tests/scoring.test.cjs`: 17 dependent scoring tests passed.
- Expo web export succeeded with a synthetic Supabase URL.
- Source-only TypeScript comparison: 82 diagnostics with the task files reverted virtually to HEAD, 82 with this implementation, zero added diagnostics. Full-project `tsc` still fails on existing errors and includes copied checkouts/Deno functions; it is not reported as passing.

UNVERIFIED: migration replay against the full intended deployment schema, production constraints/advisors, and real cross-device Supabase WebSocket delivery. Confirm these in the intended non-production environment before release. Concurrent timetable/roster edits are outside the new letter-operation locks and retain their existing workflows.

Public-hint mechanism reference: [Supabase Broadcast documentation](https://supabase.com/docs/guides/realtime/broadcast).
