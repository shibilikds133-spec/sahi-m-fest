# Code letters: staging-only backport

Prepared on 2026-10-21 from staging `3e80df8`. Only this feature is included; the 95 unrelated commits from the newer development branch are excluded.

## Current implementation

- Verified active entries can receive a manual A-Z letter before drawing. Explicit manual assignments persist in `registrations.code_letter_fixed`; existing assignments are not reclassified automatically.
- Partial draws preserve existing letters. Redraws preserve all fixed letters and redraw only the others. All-fixed redraw is a successful no-op. Reserving D or Z leaves other letters available.
- Editing an occupied letter previews and atomically swaps both assignments. Both become fixed. An unassigned entry must select an unused letter. Stale source/target assignments and locked schedules are rejected. Both sides of the swap are audited.
- Manual swaps check overlapping-event letters for participants and group members in both directions. Draw retains the existing best-effort fallback when no conflict-free draw is available, and reports remaining conflicts explicitly.
- Existing admin, tenant, verification and shuffle-lock rules remain. No separate judging-start rule was introduced. Clearing a letter clears its fixed flag.

## Scope on this staging branch

Updated existing routes: `/schedule/[id]/code-letter`, `/stage-management/[id]/code-letter`, judge marks and admin results. Registration hooks also refresh marks and schedule/stage overview consumers. Marks remain bound to registration IDs; label refreshes preserve active judge selection, mark drafts and result input.

The newer PIN stage portal, announcer page, General team entry workflow and scoring changes are not added. Migration compatibility blocks upgrade PIN RPCs only if the separate PIN portal already exists; they create no PIN schema or APIs on this staging baseline. If the PIN portal is introduced later, its code-letter adapters must be integrated in that separate release.

Data flow: Edit/Assign → expected-source/target preview → admin RPC → advisory and row locks → scope/staleness/conflict validation → one registration update → audit → empty refresh hints → existing authorized readers.

Public Realtime hints include no registration data, names, letters or credentials. Consumers refetch through existing access checks. Statement-level hints, shared subscriptions and debounce avoid a request per modified row. Foreground/reconnect refresh recovers missed updates; no periodic polling was added. Completed downloads/printouts remain snapshots.

## Changed files

- `src/app/(admin)/schedule/[id]/code-letter.tsx`, `src/app/stage-management/[id]/code-letter.tsx`: fixed assignment, swap preview and draw behavior.
- `src/app/judge/marks.tsx`, `src/app/(admin)/schedule/[id]/results.tsx`: refresh labels while preserving registration identity and drafts.
- `src/core/hooks/useParticipants.ts`, `src/core/hooks/useStageManagement.ts`, `src/services/participantService.ts`, `src/services/stageManagementService.ts`: existing read paths, new edit/draw RPCs, narrow registration cache invalidation.
- `src/core/hooks/useCodeLetterUpdates.ts`, `src/core/utils/codeLetters.ts`, `src/core/utils/invalidateCodeLetters.ts`: shared subscriptions, preview and cache helpers.
- Three migrations beginning `20261021060506`, `20261021060510`, `20261021060616`: fixed flag, atomic operations, refresh hints, compatible admin reader.
- `supabase/tests/code_letters_fixture.sql`, `supabase/tests/code_letters_transaction.sql`, `tests/code-letters-db.cjs`, `tests/code-letter-updates.test.cjs`, `tests/code-letters-browser.cjs`: isolated SQL/concurrency, subscription and staging UI checks.

## Validation

- `node tests/code-letters-db.cjs --without-portal`: 38 SQL assertions and a two-session concurrent swap test passed against disposable PostgreSQL 15, including proof that no PIN schema/API was introduced.
- `node tests/code-letters-db.cjs`: 39 assertions and concurrent-swap test passed with mocked pre-existing PIN dependencies to check migration compatibility.
- `node --test tests/code-letter-updates.test.cjs`: subscription sharing/debounce, reconnect/foreground refresh and cleanup passed.
- TypeScript comparison against the staging baseline: 66 diagnostics before and after; zero added. The existing project typecheck is not clean.
- Expo web export passed for the exact staging-port source using a synthetic Supabase URL. The isolated same-drive build checkout shares installed dependencies; no package or lockfile changes are included.
- `node tests/code-letters-browser.cjs`: existing staging screen tested with synthetic admin/RPC fixtures; direct assign, draw/redraw preservation, D/A swap, stale-save error, locked/empty states passed. Compact modal checked at 320, 375, 768, 1024 and 1440 pixels. External requests were blocked or intercepted; no real account/data was used.

These DB fixtures mock existing authorization and Realtime dependencies; they are not full-schema migration replay or real cross-device WebSocket tests. No database migrations have been applied to a shared or remote database. Apply reviewed migrations to the confirmed intended project before enabling the new frontend write paths. Original checkout dirty/staged work was preserved.
