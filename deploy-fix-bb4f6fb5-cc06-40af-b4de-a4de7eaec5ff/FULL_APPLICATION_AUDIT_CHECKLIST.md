# Full Application Audit Checklist

Purpose: verify every page and backend path without changing existing workflows unexpectedly.

## Audit rules

For every page below, record evidence before marking it complete:

- [ ] Route opens with the correct role and redirects unauthorized users.
- [ ] Tenant isolation is correct; no other tenant's data is readable or mutable.
- [ ] Active festival isolation is correct; archived/inactive/other-festival data is excluded unless explicitly required.
- [ ] All reads use the intended repository/service/RPC path and have no unscoped direct query.
- [ ] All writes validate ownership, tenant, festival, status and role on the server.
- [ ] Loading, empty, error, retry and success states are present and understandable.
- [ ] Filters, search, pagination and refresh do not show stale data or reset unexpectedly.
- [ ] Destructive actions require confirmation and preserve historical/operational data.
- [ ] Audit logging exists for sensitive mutations.
- [ ] Export/print/PDF output matches the visible filters and current scope.
- [ ] Desktop and mobile layouts are usable; no horizontal overflow or clipped controls.
- [ ] Existing workflow regression test passes for College Fest and Sahithyolsav.

Evidence fields for each audit item: `status`, `role/session`, `tenant`, `festival`, `test data`, `query/RPC`, `result`, `fix commit/migration`.

## 1. Authentication and application shell

- [ ] `/login` — admin/super-admin login, identifier resolution, disabled/archive handling, session and redirect.
- [ ] `/team/login` — team leader login, generated username/email/password flow, account status and context loading.
- [ ] `/judge` — judge token/login entry, invalid/expired/revoked token handling and redirect.
- [ ] `/candidate/[slug]` — public candidate profile, slug scope, inactive/unknown candidate handling.
- [ ] `/notifications` — notification read state, tenant scope, deep links and retry state.
- [ ] `/settings` — profile/session settings, logout, password/account state and role boundaries.
- [ ] `src/app/_layout.tsx` and role layouts — session bootstrap, route guards, notification providers, theme and error boundaries.

## 2. Admin dashboard and operations

- [ ] `/(admin)/` — dashboard counts, current festival, tenant scope, upcoming items, result status and quick actions.
- [ ] `/(admin)/organisations` — parent/sub-organisation hierarchy, active/archive/delete behavior, tenant scope and duplicate names.
- [ ] `/(admin)/team-leaders` — participant/team selection, assignment, account provisioning, generated credentials, copy/reveal behavior and re-assignment safety.
- [ ] `/(admin)/settings/team-leader-portal` — portal settings, branding/team colors, read-only settings, tenant/festival scope and persistence.
- [ ] `/(admin)/communication` — compose/send notification, recipient scope, send states, failure handling and delivery history.
- [ ] `/(admin)/communication/history` — history filters, tenant/festival isolation, pagination and message details.
- [ ] `/(admin)/judges` — judge list, create/edit/deactivate, tenant/festival scope and assignment visibility.
- [ ] `/(admin)/judges/approvals` — approval queue, approve/reject, duplicate prevention, rejection reason and audit.
- [ ] `/(admin)/judges/audit` — judge activity history, filters, immutable audit evidence and export.

## 3. Participant and registration workflows

- [ ] `/(admin)/participants` — list/search/filter, tenant/festival scope, active/archived state and counts.
- [ ] `/(admin)/participants/add` — individual participant create, validation, organisation hierarchy, category and duplicate handling.
- [ ] `/(admin)/participants/[id]` — participant details, assigned items, account links, group membership and safe actions.
- [ ] `/(admin)/participants/manage-units` — unit/organisation management, parent links, tenant isolation and active state.
- [ ] `/(admin)/participants/import` — import entry point, file validation, preview, duplicate policy and rollback behavior.
- [ ] `/(admin)/participants/import-general` — general category import, schema validation, category/item mapping and error report.
- [ ] `/(admin)/participants/import-lp` — LP import, age/category mapping, duplicate handling and result summary.
- [ ] `/(admin)/participants/import-up` — UP import, age/category mapping, duplicate handling and result summary.
- [ ] `/(admin)/participants/import-hs` — HS import, age/category mapping, duplicate handling and result summary.
- [ ] `/(admin)/participants/import-hss` — HSS import, age/category mapping, duplicate handling and result summary.
- [ ] `/(admin)/participants/import-senior` — senior import, age/category mapping, duplicate handling and result summary.
- [ ] `/(admin)/participants/import-json` — JSON schema validation, preview, safe transaction behavior and error report.
- [ ] `/(admin)/participants/chest-numbers` — chest number allocation, uniqueness, inactive/reuse rules and tenant/festival scope.
- [ ] `/(admin)/participants/chest-cards` — chest card generation, selected filters, duplicate rows, PDF layout and download count.
- [ ] Participant item registration flow — item/category assignment, unlimited-item rule, group handling, unassign safety, check-in/marks dependencies and refresh.

## 4. Schedule and venue workflows

- [ ] `/(admin)/schedule` — schedule list, current festival filter, venue/item/category/workflow filters and stale-cache prevention.
- [ ] `/(admin)/schedule/create` — single schedule create, server validation, overlap/conflict checks, venue scope and save result.
- [ ] `/(admin)/schedule/bulk-create` — 12-hour UI to 24-hour backend conversion, AM/PM correctness, buffer `0`, break validation, preview, duplicate/conflict checks, atomic save and rollback.
- [ ] `/(admin)/schedule/import-json` — JSON validation, preview, current festival scope, conflict handling and atomicity.
- [ ] `/(admin)/schedule/venues` — venue CRUD, tenant/festival scope, active state, duplicate names and schedule dependencies.
- [ ] `/(admin)/schedule/[id]/checkin` — reporting/check-in status, registration visibility, idempotency, permissions and refresh.
- [ ] `/(admin)/schedule/[id]/code-letter` — code-letter draw, participant source, one-time/refresh behavior and no stale registrations.
- [ ] `/(admin)/schedule/[id]/edit` — schedule edit permissions, time/venue conflict checks, published/history protection and audit.
- [ ] `/(admin)/schedule/[id]/marks` — mark-entry link, judge assignment, submitted/finalized lock and no unintended edits.
- [ ] `/(admin)/schedule/[id]/results` — result calculation, publication state, points and historical integrity.
- [ ] Schedule PDF exports — master, venue-wise, organisation/team-wise, item-wise and blank schedule; filter fidelity and layout.
- [ ] Bulk scheduling backend — transaction/RPC authorization, row limits, active festival validation, item/venue ownership and RLS.

## 5. Stage management

- [ ] `/stage-management` — venue/stage list is tenant + active-festival scoped; no cross-tenant leakage.
- [ ] `/stage-management/venue/[venueId]` — venue timeline, assigned schedules, live state and tenant/festival scope.
- [ ] `/stage-management/[id]/checkin` — stage check-in/reporting, allowed transitions, duplicate prevention and refresh.
- [ ] `/stage-management/[id]/code-letter` — code-letter visibility and participant source consistency.
- [ ] Stage management writes — venue/stage creation/update/delete permissions, dependency protection and audit.

## 6. Judge portal and judging workflow

- [ ] `/judge` — judge landing/context, token validation, assigned schedules only and tenant/festival scope.
- [ ] `/judge/marks` — mark entry, criteria/score validation, autosave/submit, lock/finalization and retry behavior.
- [ ] `/(admin)/schedule/[id]/marks` — admin-to-judge mark flow consistency and submission state.
- [ ] Judge assignments — assignment visibility, expected judge count, replacement/removal safety and audit.
- [ ] Judge tokens — generation, regeneration, expiry, revocation, one-time rules and tenant/festival binding.
- [ ] Results protection — submitted/finalized/published marks cannot be modified indirectly by registration or schedule changes.

## 7. Team Leader Portal

- [ ] `/team/dashboard` — portal context, team identity, festival, counts, upcoming competitions and error/retry state.
- [ ] `/team/my-team` — team participants, item registrations, chest numbers, categories and safe refresh.
- [ ] `/team/participants` — participant list, search/filter, assigned items and no cross-team data.
- [ ] `/team/schedule` — team/organisation-wise schedule, item/category filters, vertical dropdown scrolling and no stale entries.
- [ ] `/team/schedule/full` — complete schedule, PDF/print data, filter fidelity and layout.
- [ ] `/team/results` — published/public results only as intended, team scope, points and ranking consistency.
- [ ] `/team/announcements` — current tenant/festival announcements, read state and error/retry handling.
- [ ] `/team/profile` — team profile, linked participant/account, branding and read-only/edit permissions.
- [ ] Team portal context — sector/unit tenant relationships, generated credentials, active festival selection and fallback behavior.
- [ ] Team portal data refresh — participant unassign, schedule changes, check-in and published result changes propagate without stale cache.

## 8. Public pages and leaderboard

- [ ] `/` — public landing page, active festival selection, links and responsive layout.
- [ ] `/leaderboard` — public visibility rules, active festival, published results only and loading/empty states.
- [ ] `/leaderboard/item-results` — item/category filters, published result scope, duplicate elimination and ranking.
- [ ] `/leaderboard/schedule` — public schedule visibility, active/ongoing rules and time display.
- [ ] `/leaderboard/unit-rankings` — organisation/unit ranking scope, tie handling and published-only data.
- [ ] `/(public)/_layout` — public access guard, no private tenant data and festival context.
- [ ] Public result APIs/RPCs — anonymous access only to explicitly public data; no private registration, marks or credentials.

## 9. Super Admin and tenant management

- [ ] `/(super)` — super-admin guard, dashboard scope and no accidental tenant mutation.
- [ ] `/(super)/tenants` — tenant create/edit/disable/archive/revoke, profile dependencies and audit.
- [ ] `/(super)/organisations` — cross-tenant organisation administration, isolation and duplicate rules.
- [ ] Super-admin policies — role checks, service functions, tenant lifecycle and destructive confirmation.

## 10. Settings, configuration and leaderboard management

- [ ] `/(admin)/settings` — settings navigation, role visibility and active festival context.
- [ ] `/(admin)/settings/items` — item CRUD, code/category uniqueness, active/archive behavior and registration dependencies.
- [ ] `/(admin)/settings/categories` — category CRUD, age rules, template/festival scope and item compatibility.
- [ ] `/(admin)/settings/points` — point values, tie rules, publish protection and audit.
- [ ] `/(admin)/settings/calendar` — festival/calendar dates, active festival switching, timezone and schedule boundaries.
- [ ] `/(admin)/settings/api-keys` — key creation/revocation, secret masking, role protection and audit.
- [ ] `/(admin)/settings/scoring-rules` — scoring rule list, create/edit, item/category binding and historical protection.
- [ ] `/(admin)/settings/scoring-rules/[id]` — rule details, criteria validation, active usage and safe edit behavior.
- [ ] `/(admin)/settings/leaderboard` — leaderboard control center, visibility/publication state and current festival.
- [ ] `/(admin)/settings/leaderboard/controls` — publication toggles, result visibility, confirmation and audit.
- [ ] `/(admin)/settings/leaderboard/individual-rankings` — ranking filters, tie handling, export and published scope.
- [ ] `/(admin)/settings/leaderboard/unit-rankings` — unit ranking filters, points source, tie handling and export.
- [ ] `/(admin)/settings/leaderboard/item-results` — item result filters, duplicate rows, publication state and export.
- [ ] `/(admin)/settings/leaderboard/media-center` — asset upload/list/delete, storage scope, file validation and audit.
- [ ] `/(admin)/settings/leaderboard/poster-studio` — poster generation, festival/item/result data, storage cleanup and export.

## 11. APIs, Edge Functions and storage

- [ ] `/api/public-ai-chat` — public/private boundary, input validation, rate limits, secrets and error handling.
- [ ] `/api/tts` — input validation, rate limits, provider failure handling and no secret exposure.
- [ ] `resolve-login-identifier` — tenant/role-safe identifier resolution, disabled account handling and enumeration protection.
- [ ] `provision-admin` — authorization, generated identity uniqueness, password handling and audit.
- [ ] `provision-team-leader` — participant/team scope, generated code/email/password, idempotency and account-link safety.
- [ ] `notification-cron` — authorized invocation, duplicate delivery prevention and tenant/festival scope.
- [ ] `send-notification` — sender role, recipient scope, payload validation, delivery errors and audit.
- [ ] `r2-presign` — authenticated authorization, tenant path isolation, file type/size validation and expiry.
- [ ] Shared R2 client — secret handling, error paths and no client exposure.
- [ ] Storage buckets/policies — tenant paths, public/private assets, delete protection and orphan cleanup.

## 12. Database, RLS and migration integrity

- [ ] Every public table has intended tenant/festival RLS policies.
- [ ] Public read policies expose only active/public/published data.
- [ ] Admin writes enforce tenant and festival ownership server-side.
- [ ] Super-admin functions cannot be called by regular authenticated users.
- [ ] Group registration/member relationships are tested independently.
- [ ] Registration unassign checks reporting, attendance, stage status, marks, results, points and group dependencies.
- [ ] Historical marks/results are immutable through registration, schedule and item changes.
- [ ] Unique constraints are tested for chest numbers, item codes, usernames, emails and schedule slots.
- [ ] Soft-delete/archive/inactive semantics are consistent across UI, queries, exports and portal views.
- [ ] Migration history is complete, ordered and matches the deployed database.
- [ ] New migrations are applied only after read-only schema/dependency audit and rollback assessment.

## 13. Regression matrix

Run each critical workflow with at least one College Fest tenant and one Sahithyolsav tenant:

- [ ] Login → active festival → participant → item registration → chest number.
- [ ] Item registration → schedule single create → schedule bulk create → preview → save.
- [ ] Schedule → stage management → check-in/reporting → code letter.
- [ ] Schedule → judge assignment → mark entry → finalize → results → publish.
- [ ] Published results → public leaderboard → team leader results.
- [ ] Participant item unassign with no dependent data.
- [ ] Participant item unassign with dependent data is blocked/soft-cancelled with explanation.
- [ ] Group registration member removal does not delete the whole group.
- [ ] Team leader login → dashboard → participants → schedule → results → announcements.
- [ ] Tenant A cannot see or mutate Tenant B data at every tested route.
- [ ] Archived/inactive festival data does not appear in active workflows.
- [ ] PDF/CSV/export output matches current filters and row counts.
- [ ] Refresh, navigation away/back, second login and browser reload preserve correct scope.

## 14. Completion gate

- [ ] All route checkboxes have evidence.
- [ ] All failed checks have a linked fix, migration or explicit accepted limitation.
- [ ] Targeted lint/type/build checks pass.
- [ ] Browser smoke tests pass for every role.
- [ ] Database read-only verification passes after every migration.
- [ ] No unrelated files are included in the fix commit.
- [ ] Staging verification passes before production push.
- [ ] Production push is performed only after the above gates are green.
