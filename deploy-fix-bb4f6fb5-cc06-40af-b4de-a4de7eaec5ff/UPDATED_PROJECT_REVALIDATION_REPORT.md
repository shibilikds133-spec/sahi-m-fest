# Updated Project Revalidation Report

Inspection date: 2026-08-03  
Repository: `sahi-m-fest`  
Inspected commit: `92dcb8f` (`main`, equal to `origin/main` at inspection start)  
Scope: current repository plus limited anonymous, read-only live Supabase probes

## 1. Executive Summary

The updated repository is materially different from the older version. It adds a shared admin shell, judge approvals and audit screens, normalized schedule/judge assignments, token revocation and login-state RPCs, judge activity logs, festival reconciliation, a flexible/versioned points calculator, dual-mode mark entry, server-side score validation, and bulk schedule creation.

Several previously reported issues are genuinely fixed or improved. In particular, judge-token generation is now restricted in the repository to authenticated tenant administrators/superadmins, generation requires an active schedule assignment, forced regeneration revokes earlier active codes, judge approval/rejection RPCs check tenant ownership, removed judges are excluded from current calculations, and final marks are made immutable by a trigger.

The core security boundary is **not fixed**, however. The application still saves judge marks by anonymous direct `mark_entries` upsert/update. Legacy policies from migration `028` allow public SELECT/INSERT/UPDATE with `USING/WITH CHECK (true)`, and migrations `083`, `091`, and `092` do not remove those policies. The new triggers validate active assignment and score shape; they do not prove possession of the judge token, bind the write to a token, or prove the registration belongs to the schedule. A caller can supply the ID of any active assigned judge.

The live anonymous read-only probe confirmed a separate public exposure: 65 schedules were readable, `get_judge_registrations` was anonymously executable, and it returned 49 registration/participant rows across the first 10 schedule IDs tested. No participant values were printed and no live writes were attempted.

The intended Unit → Sector → Division → District advancement and points-credit model is not represented explicitly. `registration.organisation_id` is the effective leaderboard grouping field, but the schema has no durable fields for qualified-from stage, previous result, current-stage registration, representing organisation, or points-credit organisation. Migration `087` exposes every non-rejected, code-lettered registration in the schedule festival/item and the entire descendant organisation tree; it does not require current-stage qualification.

Current verdict: **NOT READY** for festival use until the specific P0 batch in section 26 is completed and tested against a production clone.

## 2. Confirmation of the Updated Repository

- Git was clean before report creation.
- Branch and remote were synchronized at `92dcb8f`.
- The current folder was used as the only source of truth.
- Migration range is `001` through `092`.
- There are two migrations numbered `082`:
  - `082_judge_token_regeneration.sql`
  - `082_update_generate_token_rpc.sql`
- New migrations `083`–`092` are present and were inspected individually.
- No source, route, migration, policy, package, database, or configuration change was made.
- The only created artifact is this requested report.

## 3. Major Differences From the Previous Version

- Shared modern admin shell and design-system primitives.
- Mobile bottom navigation and desktop sidebar.
- Judge approval and audit routes now exist.
- Schedule/judge assignments normalized into `schedule_judge_assignments`.
- Expected judge count is stored on schedules.
- Judge codes gain hashes, expiry/revocation/status metadata.
- Token generation, regeneration, approval, rejection, and audit flows improved.
- Safe/forced judge removal paths preserve historical marks.
- Judge registration lookup now filters by festival and descendant organisation tree.
- Schedule festival IDs are backfilled from items.
- Festival year derives safely from start date for new/changed records.
- Flexible point brackets, configuration versioning, calculation snapshots, and server calculation RPC added.
- Criteria and total-only mark modes added.
- Final-mark immutability and score-shape validation strengthened.
- Bulk schedule creation and extensive schedule UI changes added.

## 4. Current Technology and Migration State

### Technology

- Expo 54 / Expo Router 6
- React 19 / React Native 0.81 / React Native Web
- TypeScript 5.9
- Supabase JS 2.101
- TanStack Query 5
- NativeWind/Tailwind
- Zustand

### Scripts and validation

`package.json` exposes `start`, `android`, `ios`, `web`, and `lint`. It has no test script, no dedicated typecheck script, and no production-build script.

- TypeScript: **FAIL** using `npx.cmd tsc --noEmit --pretty false`. Errors include participant import typing/API issues, conditional hooks, Expo notifications type changes, timer typing, export-engine signature mismatch, and Deno edge-function modules being included in the app TypeScript project.
- ESLint: **FAIL**, 237 findings: 12 errors and 225 warnings. Errors include invalid `expo-file-system` namespace access, conditional Hooks, unescaped entities, and a missing Next.js lint rule.
- Tests: **UNAVAILABLE**; no automated test script or test suite was found.
- Production export: not rerun because Expo export writes `dist`, which the strict read-only instruction prohibits. A web export had passed earlier in the same current commit/session with 118 routes, but that is not a substitute for a clean, repeatable CI build. Current read-only verdict: **UNABLE TO VERIFY**.
- Generated database types: not found.
- Live migration history/catalog: unavailable through the anonymous client; privileged catalog verification remains required.

## 5. New UI and Functional Changes

The new UI is substantial and real: `AdminAppShell`, compact schedule/results/check-in views, Shadcn-inspired action menus/sheets/selects/skeletons, judge approval/audit pages, bulk schedule creation, points settings, and schedule-related modernized pages are present. Judge audit and approval routes are registered. Festival settings are integrated into sidebar navigation.

These UI changes improve usability but do not establish database authorization. The root protection remains client-side (`useProtectedRoute`), and `usePageAccess` remains a stub returning every page visible and enabled.

## 6. Migration `083–092` Review

| Migration | Intended purpose | Actual changes | Problem solved | Remaining gap | Regression risk |
|---|---|---|---|---|---|
| `083_normalize_judge_assignments` | Normalize panels and secure token generation | Adds expected judge count, token security columns, assignment table/RLS, assignment RPCs, assignment trigger, admin-only generator, readiness RPCs | FIXED assignment ownership for generation; FIXED anonymous generator grant; improves readiness | Mark trigger checks only that supplied judge is active; no token or registration binding; tenant-admin assignment policy is broad `FOR ALL` | Backfill may activate assignments inferred from legacy tokens; active-judge removal changes result population |
| `084_secure_judge_workflow_and_audit` | Approval, audit, safe deletion | Adds activity logs/RLS, login request/status/expire/approve/reject/validate RPCs, audit triggers, safe delete | FIXED direct public token-status update policy; FIXED admin approval ownership; adds audit | `validate_judge_token` accepts `created` and `pending_approval` because it rejects only `rejected`; anonymous `expire_judge_token` can consume any known token; marks remain outside token RPC | Status/audit schema depended on existing table shape, requiring 085; approval is bypassable by direct validation caller |
| `085_reconcile_judge_activity_log_schema` | Reconcile old audit schemas | Adds missing columns, backfills legacy action/details, reapplies read policy | FIXED compatibility with older audit table variants | Does not prove live triggers/functions match repository; nullable tenant IDs may remain | Legacy actor attribution can be approximate (`system`/`UNKNOWN`) |
| `086_force_remove_submitted_judge` | Allow explicit removal after final marks | Admin RPC, confirmation flag, soft removal, token revocation, preserves marks | FIXED normal/forced removal distinction and history preservation | Removed marks are excluded from active calculations; product must confirm whether recalculation after removal is acceptable | Historical published results can diverge from later active-panel recalculation |
| `087_fix_judge_registration_hierarchy` | Support child registrations in parent competition | Anonymous SECURITY DEFINER lookup filtered by item, festival, and recursive descendant tree | PARTIALLY FIXED old item-only cross-festival exposure | Not token-bound; not assignment-bound; no qualification/current-stage condition; returns participant identity | Exposes every eligible-looking descendant registration, not only advanced participants |
| `088_backfill_schedule_festivals` | Repair null schedule festival IDs | Backfills from item; redefines 087 with fallback | FIXED many null schedule/festival lookup failures | No constraint/trigger guaranteeing future item/schedule festival consistency | Incorrect item festival data propagates into schedules |
| `089_safe_festival_year_sync` | Remove stale default year | Drops 2025 default, derives year when omitted/start date changes, repairs one known row | FIXED default-year drift for normal writes | Explicit mismatches remain intentionally possible; no tenant access policy changes | The one hard-coded repair is environment-specific |
| `090_flexible_points_system` | Flexible/versioned points | Adds brackets/modes/rule-12 config, version snapshots, calculation snapshot validation, authenticated calculation RPC | FIXED configurable point arithmetic and audit snapshots | Does not model points receiver; base `points_config` RLS remains absent; caller still supplies rank/grade/count; result publication remains client table upsert | Client-selected participant count/bracket can influence awards; version snapshot trigger permissions need live verification |
| `091_dual_mode_mark_entry` | Criteria and paper total modes | Adds entry-mode/snapshots/constraints and validation trigger | FIXED dual entry mode and legacy preservation | Validation is not authorization | Empty legacy snapshots receive weaker validation |
| `092_harden_mark_entry_validation` | Strengthen final validation | Blocks final reopen/change, requires total, rejects total-only criteria, validates keys/max totals | FIXED final immutability and stronger data-shape checks | Still no token, caller, schedule-registration, festival, or tenant authorization check | Unknown-key check uses counts; duplicate keys in criteria snapshot are not explicitly rejected |

## 7. Previous Issue Revalidation Table

| Previous issue | Current status | Current evidence | Functional impact | Tenant-isolation impact | Fix needed now? |
|---|---|---|---|---|---|
| `setup_tenant_records` frontend/RPC mismatch | STILL PRESENT | UI/service forwards `p_admin_email` and `p_admin_pass`; RPC accepts only four different parameters plus generated `p_user_id` | Onboarding RPC resolution fails after auth signup | Orphan auth user possible | P1 |
| Orphan auth user after setup failure | STILL PRESENT | Auth signup precedes RPC; no compensating delete | Broken onboarding leaves account | Stray identity/profile risk | P1 |
| `setup_child_organisation` mismatch | STILL PRESENT | Frontend sends `p_internal_email`; effective RPC does not accept it | Child onboarding fails after auth signup | Orphan account risk | P1 |
| Missing `delete_child_organisation` | STILL PRESENT | Frontend calls it; no migration defines it | Delete action fails | None directly | P1 |
| Tenant list based on organisations | INTENTIONAL PRODUCT BEHAVIOUR | Provider selects organisation rows with tenant fields | Works as organisation-oriented account list | Safe if organisation RLS is correct | No |
| Plaintext temporary password storage/display | STILL PRESENT | `admin_password_temp` selected, displayed, copied | Convenient temporary onboarding | Credential disclosure | P2/product decision |
| Destructive revoke behavior | STILL PRESENT | RPC deletes auth identity/user and tenant; no soft-disable | Can destroy access and fail on dependencies | Cross-tenant catastrophic if callable | P0 with auth fix |
| Missing `lookup_email_by_username` | STILL PRESENT | Frontend calls RPC; no repository definition | Username login fails; email login works | None | P2 |
| Super Admin cards link to blocked Admin routes | STILL PRESENT | Three cards link to `/(admin)`; guard redirects superadmin back | Shortcuts unusable | None | P1 |
| Missing Judge Audit route | FIXED | `judges/audit.tsx` and layout/sidebar route exist | Audit UI available | Improves accountability | No |
| Missing System Pages route | STILL PRESENT | No route found; system logs marked Soon | Optional page absent | None | P2 |
| Client-only route protection | STILL PRESENT | `useProtectedRoute` performs redirects in client | Brief/programmable route access possible | DB must remain authoritative | P1 |
| `usePageAccess` stub | STILL PRESENT | Always visible/enabled | No granular page permissions | UI cannot enforce roles | P2; DB auth is P0 |
| Hardcoded tenant UUID fallbacks | FIXED | No hardcoded tenant UUID fallback found in current `src` | Removes wrong-tenant fallback | Improvement | No |
| Import RPCs trust `p_tenant_id` | STILL PRESENT | Import functions use caller parameters; no caller-tenant checks found | Imports function | Cross-tenant writes possible through SECURITY DEFINER/default execute | P0 |
| Cross-tenant organisation/category/item references | STILL PRESENT | Import lookups often filter festival or supplied tenant but do not validate ownership relationship | Wrong associations possible | Boundary bypass | P0 |
| Participant query cache lacks tenant ID | STILL PRESENT | Primary key is `['participants']` | Stale data after tenant change | Same-client tenant data can leak | P1 |
| Cache not cleared after logout | STILL PRESENT | module-level QueryClient; logout only clears Zustand/auth | Stale UI | Prior tenant data remains in memory | P1 |
| `schedules` RLS | STILL PRESENT | No migration enables RLS; live anon read found 65 rows | Schedule works | Public/unrelated access; write grants unverified | P0 |
| `venues` RLS | STILL PRESENT | No RLS migration; live anon read found 9 rows | Venue works | Public/unrelated access; write grants unverified | P0 |
| `festival_calendar` create/update access | STILL PRESENT | RLS enabled with SELECT policy only; client directly upserts | Admin updates can fail | Public write not shown | P1 |
| `points_config` RLS | STILL PRESENT | No base-table RLS; only version-table RLS added | Settings work depending grants | Cross-tenant access possible | P1/P0 after live grant check |
| Schedule-festival association | PARTIALLY FIXED | 088 backfills/fallback | Existing nulls repaired | No ongoing relational enforcement | P1 |
| Festival-year synchronization | FIXED | 089 trigger/default correction | Correct normal year behavior | None | No |
| Judge generator caller ownership | FIXED | 083 checks superadmin/current tenant and grants authenticated only | Correct admin workflow | Stronger tenant isolation | No |
| Active judge assignment validation | PARTIALLY FIXED | Generator/login and mark trigger check assignment | Removed judge blocked | Caller may impersonate any active judge | P0 |
| PUBLIC token generation | FIXED | 083 revokes PUBLIC, grants authenticated | Anonymous generation blocked in repository | Live signature/grants still require catalog confirmation | No after live verification |
| Public token-table SELECT | FIXED IN REPOSITORY / UNABLE TO VERIFY LIVE | 078 drops named public policy; live table returned zero without error, which cannot distinguish empty table from filtering | Validation RPC remains | Direct token disclosure not proven live | Verify |
| Public token-table UPDATE | FIXED | 084 drops open status-update policy | Status transitions through RPCs | Better isolation | No |
| Approval/rejection control | PARTIALLY FIXED | Admin RPC ownership checks; validation accepts non-rejected instead of only approved | Normal UI waits for approval | Direct RPC caller can bypass approval state | P0 within judge fix |
| Token expiry/revocation | PARTIALLY FIXED | Revocation/expiry checks exist; generated token may have null expiry | Regeneration/removal safe | Tokens can be long-lived until used/revoked | P1 |
| Judge audit logging | FIXED | Server triggers and log RPC/table/UI exist | Useful history | Tenant-read policy present | Verify live |
| Judge removal after final marks | FIXED | 086 explicit force path preserves marks | Workflow supported | No deletion of evidence | Product decision on recalculation |
| Arbitrary schedule access through `get_judge_registrations` | PARTIALLY FIXED | Festival/tree filter added; still anonymous and schedule-ID driven; confirmed live | Judge UI works | Public participant exposure | P0 |
| Public direct write to `mark_entries` | STILL PRESENT | 028 policies remain; provider direct upsert/update | Judge marking works | Anonymous mark corruption path | P0 |
| Valid token required for mark submission | STILL PRESENT | No mark RPC takes token | None for UI | Missing authorization | P0 |
| Judge/schedule/registration relationship | PARTIALLY FIXED | Judge/schedule active assignment checked; registration relationship not checked | Some invalid writes blocked | Cross-schedule registration IDs possible | P0 |
| Final mark immutability | FIXED | 092 blocks content/status/reopen changes | Preserves final marks | Strong integrity improvement | No |
| Criteria validation | FIXED for new snapshots | 092 verifies numeric keys/maxima/totals | Correct scoring data | Not caller auth | No |
| Total-only validation | FIXED | Enforces total out of 100 and empty criteria | Paper mode works | Not caller auth | No |
| Broad cross-tenant result reads | STILL PRESENT | authenticated SELECT policy uses `true` | Admin reporting works | Sibling/unrelated result read | P0 |
| Published/private result separation | PARTIALLY FIXED | Public RPCs filter published/public visibility; direct authenticated table SELECT remains broad | Public UI improved | Authenticated privacy weak | P0/P1 |
| Hardcoded stage passcode `9999` | STILL PRESENT | Literal remains in stage dashboard | Weak gate | No database identity | P1 |
| Anonymous stage writes | CHANGED INTO A DIFFERENT ISSUE | Stage uses anonymous pages and direct registration/schedule updates; current RLS likely blocks registration writes, while schedule RLS is absent | Check-in/code-letter may fail anonymously; schedule changes may work unsafely | Broken/unsafe split | P1 plus schedule P0 |
| Stage schedule/registration access | PARTIALLY FIXED / INTENDED BUT TOO BROAD | Public schedule and registration reads support stage UI; live schedule exposure and tokenless participant RPC are broader than needed | Stage UI loads | Public exposure | P0 |
| Duplicate `082` migrations | STILL PRESENT | Two 082 files redefine same RPC differently | Ordering/tool ambiguity | Live drift risk | P1 |
| Repository/live DB drift | CONFIRMED RISK | Live has data/exposure; migration history/catalog unavailable | Unknown deployed behavior | Cannot rely on files alone | P1 |
| Missing generated DB types | STILL PRESENT | None found | Type/RPC mismatches escape compile checks | Indirect | P1 |
| Old open policies not dropped | STILL PRESENT | Open mark/result policies survive later migrations | Functionality stays permissive | Major exposure | P0 |

## 8. Fixed Issues

- Admin ownership and active assignment required for judge-token generation.
- Anonymous token-generator grant removed in repository.
- Forced regeneration revokes older active codes.
- Open token status UPDATE policy removed.
- Tenant-owned approval/rejection RPCs added.
- Judge audit table, triggers, repository methods, and UI route added.
- Safe deletion/removal and force-removal workflows preserve history.
- Final marks cannot be edited or reopened.
- Criteria and total-only scoring are validated server-side.
- Schedule festival nulls are backfilled from item festival.
- Festival-year default drift corrected.
- Flexible point arithmetic and configuration snapshots implemented.
- Judge Audit route exists.
- Hardcoded tenant UUID fallback was not found in current source.

## 9. Partially Fixed Issues

- Judge approval is implemented in the normal UI path, but token validation does not require `status = 'approved'`.
- Active judge assignment is checked, but the database does not know which token/caller is submitting marks.
- Judge registration lookup is festival/tree-scoped, but still anonymous, tokenless, and not qualification-scoped.
- Token revocation/expiry is supported, but newly generated codes can have no expiry.
- Schedule-festival backfill repairs old data but does not prevent future mismatch.
- Public/private result RPCs improved, while broad direct authenticated result reads remain.
- Flexible points calculation is implemented, while recipient attribution remains implicit.

## 10. Issues Still Present

- Anonymous direct mark SELECT/INSERT/UPDATE policy path.
- No secure token-bound mark submission RPC.
- Missing schedule/venue RLS in repository and confirmed anonymous schedule/venue reads live.
- Anonymous schedule-driven participant registration RPC.
- Import RPCs trust caller-supplied tenant/festival IDs.
- Tenant/child setup RPC mismatches and orphan-user risk.
- Missing child delete and username lookup RPCs.
- Broad authenticated result reads.
- Client-only route/page permissions.
- Participant cache not tenant-scoped or cleared on logout.
- Hardcoded stage passcode and unauthenticated stage mutation design.
- Duplicate migration 082 and no generated DB types.
- TypeScript and lint do not pass.

## 11. Old Findings That Are No Longer Valid

- “Judge token generation is public” is no longer valid for the repository-effective 083 signature.
- “No judge approval/rejection control exists” is no longer valid; RPCs and UI exist.
- “Rejected/revoked tokens are accepted normally” is no longer generally valid; normal request/validation checks reject revoked/rejected/expired codes.
- “Final marks can be edited” is no longer valid after 092.
- “No judge audit route/log exists” is no longer valid.
- “Judge removal deletes history or is impossible after submission” is no longer valid.
- “Judge registrations are item-only across all festivals” is no longer valid; festival and descendant-tree filters were added.
- “Festival year is always defaulted to 2025” is no longer valid.

## 12. New Issues Introduced

1. Tracked diagnostic scripts contain hard-coded login credentials. Values are intentionally omitted here. Treat the account as exposed if the repository was ever shared/pushed.
2. `validate_judge_token` permits `created`/`pending_approval` tokens, so approval can be bypassed by a direct caller.
3. Migration 086 can cause active-panel recalculation to exclude a removed judge’s preserved final marks; policy for already-published results must be explicit.
4. The points version snapshot trigger uses upsert-on-conflict, allowing a same-version snapshot to be overwritten if the trigger fires in an unexpected path.
5. TypeScript now includes Deno edge functions without a separate Deno config, causing project typecheck failure.
6. New/updated UI contains Hook-order lint errors that can cause runtime instability.

## 13. Core Workflow Status

| Workflow step | Status | Functionality | Access/isolation |
|---|---|---|---|
| Organisation/tenant setup | PARTIALLY WORKING | Existing tenants usable; new onboarding calls mismatch RPCs | Setup/revoke SECURITY DEFINER authorization is insufficient |
| Participant creation/import | PARTIALLY WORKING | Manual paths exist; several imports have TS/API errors | Import RPC tenant trust is unsafe |
| Scheduling | WORKING but exposed | CRUD and bulk creation exist | Schedules/venues lack repository RLS; live anonymous reads confirmed |
| Judge assignment/login | PARTIALLY WORKING | Normalized assignment and approval UI exist | Approval bypass and tokenless data/mark paths remain |
| Marks | FUNCTIONALLY WORKING | Criteria and total modes supported | Public direct writes are a P0 blocker |
| Results | PARTIALLY WORKING | Rank/grade can be blank; points snapshots added | Direct client publication and broad result read remain |
| Leaderboards | PARTIALLY WORKING | Published/private RPC split and grouping exist | Attribution depends on ambiguous registration organisation |

**Core Festival Workflow verdict: PARTIALLY WORKING**

## 14. Judge Workflow Status

### Mark submission trace

| Step | UI file | Service/repository | Database operation | Authorization used |
|---|---|---|---|---|
| Judge enters token | `src/app/judge/index.tsx` | `judgeTokenService` | `request_judge_login(token)` | Token secrecy; anon RPC |
| Token validation | same | token repository/provider | `validate_judge_token(token)` | Non-used/non-revoked/non-rejected/non-expired + active assignment; **not approval-only** |
| Login approval | admin approvals page | `judgeTokenService` | approve/reject RPC | Authenticated current tenant or superadmin |
| Registrations loaded | `src/app/judge/marks.tsx` | judge repository/provider | `get_judge_registrations(schedule_id)` | Anonymous SECURITY DEFINER; no token |
| Draft marks saved | same | `upsertMarkEntry` | direct `mark_entries.upsert` | Open public policies + data triggers; no token |
| Final marks saved | same | upsert/finalize | direct upsert/update | Same as draft; final shape/immutability trigger |
| Token expired/used | judge UI/service | `expire_judge_token(token)` | anon SECURITY DEFINER update | Possession of token only |
| Results calculated | admin results page | points service + provider | authenticated calculate RPC, then direct results upsert | Tenant admin result policy; inputs supplied by client |

Answers:

1. Marks are **not** saved through a secure token-bound RPC.
2. Marks are directly upserted into `mark_entries`.
3. The database does not record which token authorized the mark write.
4. Repository-effective policies permit a public client to insert/update marks using valid IDs; live writes were intentionally not tested.
5. New triggers validate assignment and data shape, not caller authorization.
6. A caller can write as another active assigned judge by supplying that judge ID.
7. Draft and final writes share the same missing caller authorization; final content gains immutability only after finalization.

**Judge Workflow verdict: FUNCTIONALLY WORKING BUT PARTIALLY EXPOSED**

## 15. Marks Security and Validation Status

Functionality: dual-mode entry, totals, criterion maxima, snapshot consistency, active assignment, and final immutability are meaningful improvements.

Access/data isolation: still unsafe. Validation is not authorization. The minimum secure design is a SECURITY DEFINER mark RPC taking the presented token and registration, deriving judge/schedule/tenant server-side, validating current assignment and current-stage registration, and revoking direct anon table grants/policies.

## 16. Schedule/Venue/Points Isolation Status

- `schedules`: no repository RLS enable/policies; 65 rows anonymously readable live.
- `venues`: no repository RLS enable/policies; 9 rows anonymously readable live.
- `festival_calendar`: RLS enabled, but repository defines only authenticated SELECT; direct admin upsert can fail unless live has extra policies.
- `points_config`: no base-table RLS in repository; only `points_config_versions` receives tenant RLS.
- `points_config_versions`: tenant read/insert policies exist, but update/delete are not granted by policy.
- `calculate_festival_points`: tenant/superadmin check is present and output is snapshotted.

## 17. Participant Import Status

The import RPCs for Junior, Senior, UP, LP, HS, HSS, General, and schedule chunks accept `p_tenant_id` and `p_festival_id`. No consistent check was found that the caller owns that tenant/festival. Several are SECURITY DEFINER and no explicit `REVOKE ALL ... FROM PUBLIC` was found, so PostgreSQL’s default function execute privilege is a material risk.

Functionality also has current compile/lint failures in import screens, including optional IDs and outdated `expo-file-system.documentDirectory` access.

## 18. Hierarchy and Advancement Status

### Required stage model versus current implementation

| Stage | Competition tenant | Representing organisation | Points receiver | Participant record used | Registration used |
|---|---|---|---|---|---|
| Unit | Unit tenant can be stored | Participant/registration organisation | Same registration organisation | Home participant row | Festival/item registration |
| Sector | Sector schedule tenant exists | Usually original Unit if registration org remains Unit | Registration org | Same participant may be visible through child tree | No explicit qualified/current-stage link |
| Division | Division schedule tenant possible | Required Sector representation not explicitly stored | Whatever registration org contains | No explicit advancement copy/link | No source/previous registration link |
| District | District schedule tenant possible | Required Division representation not explicitly stored | Whatever registration org contains | No explicit advancement copy/link | No source/previous registration link |

Explicit durable fields were not found for home organisation, current competition tenant on the registration distinct from home tenant, qualified-from organisation, points-credit organisation, previous-stage result, or source registration. `festival_id`, `tenant_id`, and one `organisation_id` are overloaded.

Migration 087/088 selects all non-rejected, code-lettered registrations matching schedule item/festival whose organisation is anywhere in the schedule owner’s descendant tree. It does **not** enforce advancement, qualification, or current-stage status.

**Hierarchy Advancement verdict: PARTIALLY IMPLEMENTED**

## 19. Points Attribution Status

The point amount calculation is substantially improved and server-checked. The recipient grouping is not.

- Result payload has no organisation/credit field.
- Leaderboards derive organisation using `COALESCE(registration.organisation_id, participant.organisation_id)`.
- Manual participant registration copies `participant.organisation_id` into the registration.
- No automatic rule was found that transforms Unit → Unit, Sector → Unit, Division → Sector, District → Division.
- Therefore sector points can be correct when registration organisation is the Unit, but Division/District attribution is not reliably encoded or derived.

**Points Attribution verdict: CORRECT AT SOME LEVELS**

## 20. Parent–Child vs Sibling/Unrelated Access

### Classification

- Parent reading descendant participants/registrations for an operated stage: **INTENDED HIERARCHY ACCESS**, but only for qualified current-stage records.
- Migration 087/088 descendant-tree lookup: **INTENDED BUT TOO BROAD** and **PUBLIC EXPOSURE**.
- Participant/registration RLS through `is_org_visible`: intended hierarchy concept, but update/delete permissions over the entire visible tree require product confirmation.
- Open schedules/venues: **PUBLIC EXPOSURE / MISSING AUTHORIZATION**.
- Broad authenticated results SELECT: **SIBLING/UNRELATED TENANT LEAK**.
- Import RPC caller-supplied tenant: **MISSING AUTHORIZATION** with cross-tenant write potential.

### Operation-level matrix

| Relationship | Participant read | Participant edit | Registration read | Marks write | Result publish | Points credit |
|---|---:|---:|---:|---:|---:|---:|
| Own Unit admin | Allowed | Allowed | Allowed | Admin tenant path; judge path unsafe | Allowed for own tenant | Registration org |
| Parent Sector admin | Intended descendant read | Currently potentially broad descendant edit | Intended but too broad | Should be judge-token only; currently public path | Competition tenant path | Usually Unit if registration org is Unit |
| Parent Division admin | Intended only for qualified stage | Not safely modeled | Tree access too broad | Same public path | Competition tenant path | Not reliably transformed to Sector |
| Sibling Unit | Should deny | Should deny | Public policy/RPC can expose | Public mark path if IDs known | Should deny by write policy | Should not credit |
| Unrelated tenant | Should deny | Should deny | Schedule/RPC exposure may reveal | Public mark path if IDs known | Authenticated direct read is broad; write should deny | Should not credit |
| Public/anonymous | Public profile/published subset only | Deny | Live judge RPC exposed 49 rows/10 schedules | Repository path permits direct mark writes | Deny | None |

**Tenant Isolation verdict: NOT RELIABLE**

## 21. Live Database Verification Status

Available and performed:

- Anonymous read-only REST probes using configured publishable/anon credentials.
- No login, insert, update, delete, token request, token expiry, or migration action.
- Live anonymous observations:
  - `schedules`: readable, count 65.
  - `venues`: readable, count 9.
  - `get_judge_registrations`: anonymously executable.
  - First 10 readable schedule IDs returned an aggregate 49 judge-registration rows.
  - `validate_judge_token` is anonymously executable.

Zero-count successful table probes do not prove a table is public; RLS may have filtered all rows, or the table may be empty. Mark-write exposure was not tested because that would modify data.

Unavailable without privileged read-only SQL/catalog access:

- Applied migration history through 092.
- Effective RLS/policies and grants.
- Exact function bodies/signatures and execute grants.
- Null/invalid boundary counts.

Required read-only SQL checks:

```sql
select version from supabase_migrations.schema_migrations order by version;

select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('schedules','venues','festival_calendar','points_config',
                    'judge_tokens','mark_entries','results','registrations',
                    'participants','schedule_judge_assignments','judge_activity_logs');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select routine_name, specific_name, security_type, routine_definition
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'generate_judge_token','request_judge_login','get_judge_login_status',
    'validate_judge_token','expire_judge_token','get_judge_registrations',
    'calculate_festival_points','setup_tenant_records','setup_child_organisation',
    'delete_child_organisation','revoke_tenant_access','lookup_email_by_username'
  );

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
order by routine_name, grantee;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','PUBLIC')
order by table_name, grantee, privilege_type;

select count(*) filter (where tenant_id is null) as null_tenant,
       count(*) filter (where festival_id is null) as null_festival
from public.schedules;

select count(*) as boundary_mismatch
from public.mark_entries me
join public.schedules s on s.id = me.schedule_id
join public.registrations r on r.id = me.registration_id
where me.tenant_id is distinct from s.tenant_id
   or r.item_id is distinct from s.item_id
   or r.festival_id is distinct from s.festival_id;
```

## 22. P0 Current Blockers

**P0 count: 8**

1. Public/tokenless judge registration exposure, confirmed live.
2. Direct anonymous mark read/write architecture with no token-bound submission.
3. Missing schedule/venue RLS and live anonymous schedule/venue exposure; effective write grants must be treated as unsafe until proven otherwise.
4. SECURITY DEFINER import RPCs trust caller-supplied tenant/festival and references.
5. Tenant setup/revoke SECURITY DEFINER functions lack adequate caller authorization; revoke is destructive.
6. Broad authenticated `results` SELECT permits unrelated tenant reads.
7. Hard-coded login credentials in tracked diagnostic scripts.
8. Advancement/representation/points-recipient model is insufficient to guarantee correct participants and points at Division/District levels.

## 23. P1 Serious Issues

**P1 count: 9**

1. Tenant setup parameter mismatch and orphan-user rollback gap.
2. Child setup mismatch and missing child delete RPC.
3. Festival calendar and points configuration policy gaps.
4. Hardcoded stage passcode and anonymous stage mutation design.
5. Participant cache lacks tenant key and logout clearing.
6. Client-only route protection, broken superadmin-to-admin cards, and page-access stub.
7. Duplicate 082, live/repository drift risk, and missing generated types.
8. TypeScript/lint failures and no repeatable read-only production build proof.
9. Token approval can be bypassed through validation; token expiry may be null.

## 24. P2 Deferred Issues

**P2 count: 6**

1. Plaintext temporary password storage/display redesign.
2. Missing username lookup when email login is available.
3. Missing System Pages/System Logs UI.
4. Dashboard metrics and cosmetic polish.
5. Any-Festival/template/billing architecture work.
6. Optional page-level visibility customization after database authorization is correct.

## 25. Features Requiring Product Decisions

- Whether force-removing a submitted judge should recalculate an unpublished result, preserve the old panel, or require a formal re-judging workflow.
- Exact advancement rule and how a participant becomes current-stage eligible.
- Whether participant identity should be visible before judge token validation.
- Whether stage coordinators receive authenticated accounts, scoped stage tokens, or a server-validated venue passcode.
- Whether a registration’s organisation is immutable representation or can change per stage.
- Whether blank rank/grade is allowed for published results. The current UI supports it and produces zero points; this matches the latest requested behavior.
- Whether parent admins may edit descendant participant master data or only current-stage registrations.

## 26. Minimum Recommended Fix Batch

Do not begin Any-Festival migration. The smallest current-festival batch is:

1. Remove/restrict public `mark_entries` SELECT/INSERT/UPDATE policies and table grants.
2. Add one token-bound mark RPC that derives judge/schedule/tenant from an **approved** active token, validates the registration’s exact current-stage eligibility, writes draft/final marks, logs token ID, and enforces final immutability.
3. Make `get_judge_registrations` require and validate the approved token; return only current-stage qualified registrations.
4. Enable strict tenant/hierarchy-aware RLS on schedules and venues; restrict public schedule output to a dedicated published projection/RPC.
5. Lock every import/setup/revoke SECURITY DEFINER RPC: revoke PUBLIC, grant only required roles, validate caller tenant/superadmin, and validate all referenced festival/item/category/organisation ownership.
6. Remove broad authenticated result SELECT and use tenant/hierarchy-scoped admin RPCs plus published-only public RPCs.
7. Remove exposed credentials from the repository/history and rotate the affected account/password immediately.
8. Define the stage representation record: source registration/result, competition tenant/festival, representing organisation, and points-credit organisation. Backfill only after read-only reconciliation and approval.

## 27. Required Tests

- Anonymous cannot list schedules beyond explicitly public fields.
- Anonymous cannot list judge tokens or mark entries.
- Anonymous cannot insert/update/finalize marks directly.
- Created/pending/rejected/expired/revoked/used tokens cannot load registrations or submit marks.
- Approved token can access only its assigned schedule and judge identity.
- Token A cannot write as Judge B.
- Registration from another item/festival/tree/current stage is rejected server-side.
- Draft save and final submit use the same token authorization.
- Final marks cannot be edited/reopened.
- Unit, Sector, Division, District advancement fixtures verify exact representation and points receiver.
- Sibling and unrelated tenants cannot read/edit participant, registration, schedule, marks, or private result data.
- Parent access allows only explicitly intended current-stage operations.
- Import RPC rejects foreign tenant/festival/item/category/organisation IDs.
- Tenant/child onboarding is atomic or compensates auth user on failure.
- Logout clears all tenant-sensitive QueryClient state.
- Stage coordinator workflow succeeds through a scoped server authorization mechanism.
- TypeScript, ESLint, migration lint, database tests, and Expo web export run in CI from a clean checkout.

## 28. Final Verdict

### Core Festival Workflow

`PARTIALLY WORKING`

### Tenant Isolation

`NOT RELIABLE`

### Judge Workflow

`FUNCTIONALLY WORKING BUT PARTIALLY EXPOSED`

### Hierarchy Advancement

`PARTIALLY IMPLEMENTED`

### Points Attribution

`CORRECT AT SOME LEVELS`

### Current Festival Readiness

`NOT READY`

NO CODE, DATABASE, OR CONFIGURATION CHANGES PERFORMED — REPORT ONLY
