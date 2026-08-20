# Architecture & Migration Deep Report — Phase 3

**Date**: 2026-07-22
**Scope**: Complete evidence-based architecture and migration analysis
**Mode**: READ-ONLY. Decision-ready report.

---

## 1. Executive Decision Summary

This project is a functional Expo + Supabase festival management platform with significant security vulnerabilities that must be fixed before any production use. The architecture has a sound provider/repository/service design that is partially implemented, but critical RLS bypasses, inconsistent role models, and grade calculation conflicts exist. The project does NOT require a rewrite. It requires targeted security fixes, RLS completion, role standardization, and a gradual custom backend introduction.

**Verdict**: Repair, not rewrite. The architecture is correct; the implementation has gaps and security holes.

---

## 2. Repository Evidence Reverified

### Verification Table

| Claim | Source | Evidence | Status | Confidence |
|---|---|---|---|---|
| `mark_entries` RLS bypass | Phase 2 §8 | `027_judge_portal_rls_bypass.sql` lines 47-62: `USING (true) WITH CHECK (true)` for INSERT/UPDATE to public, anon, authenticated | **Confirmed** | Certain |
| `judge_tokens` public SELECT | Phase 2 §8 | `019_judge_tokens.sql` lines 20-23: `FOR SELECT USING (true)` | **Confirmed** | Certain |
| `organisations` wide-open RLS | Phase 2 §8 | `007_flexible_hierarchy.sql` lines 48-49: `FOR ALL USING (true)`. Migration `014` drops policies from `011` but NOT the `007` policy | **Confirmed** — the `FOR ALL USING (true)` from 007 is likely still active | Certain |
| `participants` wide-open RLS | Phase 2 §8 | `004_phase5_participant_management.sql` lines 38-39: `FOR ALL USING (true)`. PostgreSQL ORs policies, so this makes 011's tenant check irrelevant | **Confirmed** — tenant isolation on participants is effectively bypassed | Certain |
| `system_api_keys` wide-open | Phase 2 §8 | Root `create_system_api_keys.sql` lines 19-45: all operations `USING (true)` | **Confirmed** | Certain |
| Hard-coded credentials | Phase 2 §8 | `008_superadmin_setup.sql` lines 12,43: `shibilikds938@gmail.com` / `m1o2n3u4` | **Confirmed** | Certain |
| Grade 70% vs 75% | Phase 2 §7 | `pointCalculator.ts` line 6: `pct >= 70`; `resultCalculator.ts` line 24: `score >= 75` | **Confirmed** | Certain |
| Broken role references | Phase 2 §8 | `030_leaderboard_settings.sql` line 59: `role IN ('super_admin', 'tenant_admin')` — not in CHECK constraint | **Confirmed** | Certain |
| `dexie` unused | Phase 2 §3 | No imports found in src/ | **Confirmed** | High |
| `openai` unused | Phase 2 §3 | No imports found in src/ | **Confirmed** | High |
| `zod` unused | Phase 2 §3 | No imports found in src/ | **Confirmed** | High |
| `@react-navigation/bottom-tabs` unused | Phase 2 §3 | No tab layouts found | **Confirmed** | High |
| `listParticipants()` unscoped | Phase 2 §9 | `SupabaseDatabaseProvider.ts:157-163` — no tenant filter | **Confirmed** | Certain |
| `usePageAccess.ts` stub | Phase 2 §3 | Returns `{isVisible: true, canEdit: true}` | **Confirmed** | Certain |
| No automated tests | Phase 2 §3 | Zero test files found | **Confirmed** | Certain |
| Duplicate migration 018/022 | Phase 2 §4 | Two files each | **Confirmed** | Certain |
| `018b` invalid SQL | Phase 2 §4 | Contains Malayalam text, not SQL | **Confirmed** | Certain |
| `022_scoring_rules.sql` DROP CASCADE | Phase 2 §4 | `DROP TABLE IF EXISTS scoring_criteria CASCADE` | **Confirmed** | Certain |
| No database type generation | Phase 2 §13 | No `supabase gen types` output found | **Confirmed** | Certain |
| `festival_calendar` defaults to 2025 | Phase 2 §6 | `001_initial_schema.sql` line 18 | **Confirmed** | Certain |
| `get_public_leaderboard` hard-codes 2026 | Phase 2 §6 | `024_public_leaderboard_rpc.sql` line 53 | **Confirmed** | Certain |

### Corrections to Earlier Reports

| Earlier Claim | Correction | Source |
|---|---|---|
| Phase 2 stated organisations RLS "may still be active" | **Confirmed still active**: `014` drops policies from `011` but not the `FOR ALL USING (true)` from `007` | Migration content |
| Phase 1 listed ~30 files with direct Supabase imports | Actual count: 7 files with direct `import { supabase }`, plus 1 file importing `createClient` directly | Grep verification |
| Phase 1 stated "Dual storage providers" | Correct — but `EXPO_PUBLIC_STORAGE_PROVIDER` env var selects at module load time, not runtime | `providers/storage/index.ts` |
| Phase 2 stated multi-tenant readiness 65% | Revised to **45%** — participants and organisations have effective RLS bypasses | Evidence |

---

## 3. Current Software Condition

### Authentication
- **Status**: Implemented but with gaps
- **Major files**: `src/app/(auth)/login.tsx`, `src/core/store/authStore.ts`, `src/services/authService.ts`, `src/providers/auth/`
- **What works**: Login, logout, session persistence, profile loading, route protection
- **What's missing**: No password reset UI, no disabled-user handling, no session refresh in UI
- **Security**: Service layer properly abstracts Supabase Auth

### Tenant Management
- **Status**: Partially implemented
- **Major files**: `src/app/(super)/tenants/`, `src/services/superService.ts`, `src/lib/repositories/superRepository.ts`
- **What works**: Tenant creation via RPC, tenant listing, tenant revocation
- **What's missing**: No tenant editing, no subscription management UI
- **Security**: `revoke_tenant_access()` has no role check — any authenticated user can call it

### Organisation Hierarchy
- **Status**: Partially implemented with critical RLS gap
- **Major files**: `src/app/(admin)/organisations/`, `src/services/organisationService.ts`
- **What works**: Hierarchical org creation, parent-child relationships
- **What's broken**: `organisations` table has `FOR ALL USING (true)` policy from `007` that is NOT dropped by `014`
- **Impact**: Any authenticated user can modify any organisation record

### Festival Management
- **Status**: Partially implemented
- **Major files**: `src/app/(admin)/settings/calendar.tsx`, `src/services/festivalSettingsService.ts`
- **What works**: Active festival selection, festival calendar CRUD
- **What's missing**: No festival switcher UI, no historical festival view, no festival archive
- **Hard-coded**: `festival_year DEFAULT 2025`, `ssf_get_category()` hard-codes 2026

### Participants
- **Status**: Implemented but with critical RLS gap
- **Major files**: `src/app/(admin)/participants/`, `src/services/participantService.ts`
- **What works**: Full CRUD, 7 import variants, profile photos, chest numbers, code letters
- **What's broken**: `participants` table has `FOR ALL USING (true)` from `004` that bypasses tenant isolation
- **Provider layer**: Properly migrated to service→repository→provider chain

### Registrations
- **Status**: Implemented but with RLS gap inherited from participants
- **Major files**: Via participant detail screens, `participantService.registerParticipantForItem`
- **What works**: Rule engine validation, registration CRUD
- **Security**: RLS inherits the participants bypass

### Items and Categories
- **Status**: Implemented
- **Major files**: `src/app/(admin)/settings/items.tsx`, `src/services/festivalSettingsService.ts`
- **What works**: Item configuration, category management, points config
- **Security**: Properly RLS-protected via `get_my_tenant_id()`

### Venues
- **Status**: Implemented
- **Major files**: `src/app/(admin)/schedule/venues.tsx`, `src/services/scheduleService.ts`
- **What works**: Venue CRUD
- **Security**: RLS status unconfirmed — no explicit RLS found in migrations for venues table

### Schedules
- **Status**: Implemented
- **Major files**: `src/app/(admin)/schedule/`, `src/services/scheduleService.ts`
- **What works**: Schedule CRUD, JSON import, venue assignment
- **Security**: RLS status unconfirmed — no explicit RLS found in migrations for schedules table

### Judges
- **Status**: Implemented
- **Major files**: `src/app/(admin)/judges/`, `src/services/judgeService.ts`
- **What works**: Judge CRUD, assignment to schedules
- **Security**: Properly RLS-protected

### Judge Portal
- **Status**: Implemented with token-based access
- **Major files**: `src/app/judge/`, `src/services/judgeTokenService.ts`
- **What works**: Token generation, validation, mark entry
- **Security**: Token SELECT is public (by design for validation), but mark_entries INSERT/UPDATE is wide open

### Marks
- **Status**: Implemented but with critical RLS bypass
- **Major files**: `src/app/(admin)/schedule/[id]/marks.tsx`, `src/app/judge/marks.tsx`
- **What works**: Criteria-based scoring, draft/final states
- **What's broken**: `mark_entries` has `USING (true) WITH CHECK (true)` for INSERT/UPDATE to public/anon/authenticated

### Results
- **Status**: Implemented
- **Major files**: `src/app/(admin)/schedule/[id]/results.tsx`
- **What works**: Rank calculation, grade assignment, points calculation, publish
- **Security**: Properly RLS-protected via `get_my_tenant_id()`

### Grading
- **Status**: Conflicting implementations
- **What's broken**: `pointCalculator.ts` uses 70% for A grade; `resultCalculator.ts` uses 75%
- **Documentation**: `rule.md` states 75%

### Leaderboards
- **Status**: Implemented but with broken RLS
- **Major files**: `src/app/(public)/leaderboard/`, `src/services/leaderboardService.ts`
- **What works**: Public and admin views, unit/individual rankings
- **What's broken**: `festival_leaderboard_settings` RLS references non-existent roles (`super_admin`, `tenant_admin`)

### Certificates
- **Status**: Database table exists, no implementation
- **Major files**: None — `certificates` table created in `001` but no UI or service code
- **Security**: RLS unconfirmed

### Communication
- **Status**: Implemented
- **Major files**: `src/app/(admin)/communication/`, Edge Function `send-notification`
- **What works**: Push notifications, in-app inbox, notification history
- **Security**: Edge Function uses service-role but tenant-scoped

### Notifications
- **Status**: Implemented
- **Major files**: `src/core/contexts/NotificationContext.tsx`, `src/app/notifications.tsx`
- **What works**: Push token registration, realtime subscription, toast UI
- **Security**: User-scoped via RLS and auth.uid()

### Imports
- **Status**: Implemented
- **Major files**: 7 import screens, `src/core/hooks/useBulkImport.ts`, RPC functions
- **What works**: Category-specific Excel import via RPC
- **Security**: RPCs accept client-supplied tenant_id — no server verification

### Exports
- **Status**: Partially implemented
- **Major files**: `src/services/exportQueueService.ts`, `src/components/leaderboard/BackgroundExportEngine.tsx`
- **What works**: Background poster/asset export with retry
- **Security**: Bypasses provider layer

### Poster Studio
- **Status**: Implemented
- **Major files**: `src/components/leaderboard/PosterStudio/`, `src/app/(admin)/settings/leaderboard/poster-studio.tsx`
- **What works**: Canvas-based poster editor, template management, asset generation
- **Security**: RLS references non-existent roles

### Public Pages
- **Status**: Implemented
- **Major files**: `src/app/(public)/`, `src/components/publicLanding/`
- **What works**: Landing page, leaderboard, schedule, item results, candidate profiles, unit profiles, AI chatbot
- **Security**: Uses SECURITY DEFINER RPCs — properly isolated

### Storage
- **Status**: Implemented
- **Major files**: `src/providers/storage/`, `src/services/storage/`
- **What works**: R2 + Supabase Storage dual providers, presigned URLs, metadata tracking
- **Security**: R2 flow properly authenticated via Edge Function

### Audit Logging
- **Status**: Partially implemented
- **Major files**: `participant_unit_audit_logs`, `system_events`, `audit_logs` tables
- **What works**: Unit assignment audit, system events
- **What's missing**: No general audit UI, no result publication audit

### Backup/Recovery
- **Status**: Not implemented
- **Major files**: None
- **What exists**: Root SQL scripts for test data management

---

## 4. Verified Migration Completion Levels

### 1. Database Schema Migration: **78%**
- **Completed**: 30+ tables created with proper columns, FKs, indexes
- **Incomplete**: `venues`, `schedules`, `point_table` RLS unconfirmed; `certificates` missing `festival_id`; `system_api_keys` missing tenant isolation
- **Evidence**: All 76 migration files read; schema map in Phase 2 §6

### 2. Tenant Isolation: **40%**
- **Completed**: `get_my_tenant_id()` helper; core tables have tenant_id; most RLS policies use it
- **Incomplete**: `participants` and `organisations` have effective RLS bypasses via `FOR ALL USING (true)` from earlier migrations; `system_api_keys` has no tenant isolation
- **Evidence**: `004` line 38-39, `007` line 48-49, `create_system_api_keys.sql`

### 3. Festival Isolation: **55%**
- **Completed**: Most tables have `festival_id`; active festival selection works
- **Incomplete**: Hard-coded years in functions and defaults; no festival switcher UI; `scoring_rules` missing `festival_id`
- **Evidence**: `001` line 18, `006` line 72, `024` line 53

### 4. Organisation Permission Migration: **30%**
- **Completed**: Hierarchical org creation; `is_org_visible()` RPC; participant/registration RLS uses it
- **Incomplete**: `organisations` table has wide-open RLS; role model inconsistent; no permission matrix
- **Evidence**: `007` line 48-49, `030` line 59

### 5. Provider/Repository Abstraction: **55%**
- **Completed**: Auth, participants, festival settings, judges, schedules, leaderboard, results visibility, organisation, super admin use the chain
- **Incomplete**: `fontService`, `publicAiService`, `unitProfileService`, `exportQueueService` bypass it; `listParticipants()` unscoped
- **Evidence**: Phase 1 §7, Phase 2 §8

### 6. Direct Supabase Removal: **70%**
- **Completed**: 11 repositories, 20 services, 18 hooks — most use the provider chain
- **Incomplete**: 7 files with direct `supabase` import; 1 file importing `createClient` directly
- **Evidence**: Phase 2 §8 grep results

### 7. Authentication Abstraction: **85%**
- **Completed**: `AuthProvider` interface; `SupabaseAuthProvider` implementation; `authService` wraps it; `authStore` manages state
- **Incomplete**: No password reset; `superService.ts` creates isolated client; no disabled-user handling
- **Evidence**: `src/providers/auth/`, `src/services/authService.ts`

### 8. Storage Abstraction: **90%**
- **Completed**: `StorageProvider` interface; `R2StorageProvider` and `SupabaseStorageProvider` implementations; `storageService` wraps it
- **Incomplete**: Env var selection at module load time (not runtime); `fontService` bypasses it
- **Evidence**: `src/providers/storage/`, `src/services/storage/`

### 9. Multi-Festival UI Readiness: **25%**
- **Completed**: Active festival loads automatically
- **Incomplete**: No festival selector; no historical festival view; no festival archive; no festival status management
- **Evidence**: `useFestival.ts` — only fetches active festival

### 10. Festival Template Readiness: **0%**
- **Completed**: None
- **Incomplete**: No template system; no configurable modules; no feature flags per festival level
- **Evidence**: No template code exists

### 11. Supabase Production Stability: **35%**
- **Completed**: Core flows work; auth, participants, registrations, schedules, judges, marks, results all functional
- **Incomplete**: Critical RLS bypasses; broken role references; hard-coded years; grade inconsistency; no automated tests
- **Evidence**: All P0 findings

### 12. Custom Backend Readiness: **20%**
- **Completed**: Provider interfaces exist; service layer partially implemented; repository contracts defined
- **Incomplete**: Interfaces expose Supabase-specific patterns; no API adapter; no backend-neutral contracts
- **Evidence**: `DatabaseProvider` has 146 methods, many Supabase-specific

### 13. Overall Production Readiness: **30%**
- **Blocked by**: P0 security issues (mark_entries, judge_tokens, system_api_keys, organisations, participants RLS)
- **Blocked by**: Grade calculation inconsistency
- **Blocked by**: Hard-coded credentials in migration history
- **Blocked by**: No automated tests

---

## 5. P0 Security Findings

### P0-1: mark_entries RLS Bypass

| Aspect | Detail |
|---|---|
| **File** | `supabase/migrations/027_judge_portal_rls_bypass.sql` |
| **Lines** | 47-62 |
| **Current Policy** | SELECT: `USING (true)` for public/anon/authenticated; INSERT: `WITH CHECK (true)` for public/anon/authenticated; UPDATE: `USING (true) WITH CHECK (true)` for public/anon/authenticated |
| **Exploit** | Any anonymous or authenticated user can read, insert, or update any judge's marks in any tenant |
| **Data Exposed** | All mark entries across all tenants |
| **Data Modifiable** | All mark entries — can change scores, finalize marks |
| **Production Impact** | Results can be manipulated; competition integrity compromised |
| **Correct Approach** | Replace with policy that checks: (1) user is the judge who owns the mark, OR (2) user is admin of the schedule's tenant. Judge portal access should be via SECURITY DEFINER RPC only, not RLS bypass |
| **Existing Data** | No repair needed — data integrity depends on who has accessed it |
| **Rollback** | Drop the three policies, restore `018`/`020` policies |
| **Test Cases** | Verify anon cannot INSERT/UPDATE; verify admin can; verify judge can only own marks |
| **Confidence** | Certain |

### P0-2: judge_tokens Public SELECT

| Aspect | Detail |
|---|---|
| **File** | `supabase/migrations/019_judge_tokens.sql` |
| **Lines** | 20-23 |
| **Current Policy** | `FOR SELECT USING (true)` — anyone can read all tokens |
| **Exploit** | Enumerate all unused tokens; use them to access judge portal |
| **Data Exposed** | All judge tokens (judge_id, schedule_id, tenant_id, token value) |
| **Production Impact** | Unauthorized judge portal access; mark manipulation |
| **Correct Approach** | Token validation is already done via `validate_judge_token()` RPC (SECURITY DEFINER). The SELECT policy should be restricted to authenticated admins only. The judge portal should only use the RPC, not direct table access |
| **Rollback** | Drop the public SELECT policy, keep the admin ALL policy |
| **Confidence** | Certain |

### P0-3: organisations Wide-Open RLS

| Aspect | Detail |
|---|---|
| **File** | `supabase/migrations/007_flexible_hierarchy.sql` |
| **Lines** | 48-49 |
| **Current Policy** | `FOR ALL USING (true)` — any authenticated user can modify any organisation |
| **Exploit** | Any authenticated user can rename, re-parent, or delete any organisation |
| **Data Modifiable** | All organisation records |
| **Production Impact** | Hierarchy corruption; tenant isolation bypass |
| **Correct Approach** | Drop the `FOR ALL USING (true)` policy. The `014` migration only drops policies from `011`, not from `007`. Need explicit `DROP POLICY IF EXISTS "Admins full access to organisations" ON organisations` |
| **Rollback** | Drop the policy, verify `014` policies still work |
| **Confidence** | Certain |

### P0-4: participants Wide-Open RLS

| Aspect | Detail |
|---|---|
| **File** | `supabase/migrations/004_phase5_participant_management.sql` |
| **Lines** | 38-39 |
| **Current Policy** | `FOR ALL USING (true)` — PostgreSQL ORs this with `011`'s tenant check, making the tenant check irrelevant |
| **Exploit** | Any authenticated user can read/modify all participants across all tenants |
| **Data Modifiable** | All participant records |
| **Production Impact** | Complete tenant isolation bypass on the core entity |
| **Correct Approach** | Drop the `FOR ALL USING (true)` policy. The `028` migration adds proper `is_org_visible` policies, but the `004` policy still exists and overrides them via OR logic |
| **Rollback** | Drop the policy, verify `028` policies still work |
| **Confidence** | Certain |

### P0-5: Hard-Coded Credentials

| Aspect | Detail |
|---|---|
| **File** | `supabase/migrations/008_superadmin_setup.sql` |
| **Lines** | 12, 43 |
| **Current Content** | Email: `shibilikds938@gmail.com`, Password: `m1o2n3u4` |
| **Risk** | Credentials visible in migration history; if migration was applied, account exists with known password |
| **Correct Approach** | After applying migration, change the password via Supabase dashboard. Add a note to migration that password should be changed immediately. Never include passwords in migrations going forward |
| **Rollback** | Cannot remove from migration history; change password in production |
| **Confidence** | Certain |

### P0-6: Grade Calculation Inconsistency

| Aspect | Detail |
|---|---|
| **File 1** | `src/core/utils/pointCalculator.ts` line 6 |
| **File 2** | `src/lib/calculators/resultCalculator.ts` line 24 |
| **Thresholds** | File 1: 70% for A; File 2: 75% for A |
| **Impact** | Scores between 70-74% get different grades depending on which code path runs |
| **Which is used where** | `pointCalculator.ts` is used by `judgeService.ts` and mark entry flow; `resultCalculator.ts` is used by `ResultCalculator` class |
| **Correct Approach** | Standardize to 75% per `rule.md`. Fix `pointCalculator.ts` line 6 from `70` to `75` |
| **Confidence** | Certain |

### P0-7: system_api_keys Wide-Open RLS

| Aspect | Detail |
|---|---|
| **File** | Root `create_system_api_keys.sql` |
| **Lines** | 19-45 |
| **Current Policy** | All operations `USING (true)` for authenticated |
| **Exploit** | Any authenticated user can read all API keys; can insert/update/delete keys |
| **Data Exposed** | Gemini, OpenAI, Anthropic API keys |
| **Correct Approach** | Drop and recreate with admin-only policies. Or better: move API keys to Edge Function environment variables, remove the table entirely |
| **Rollback** | Drop table, recreate with proper RLS |
| **Confidence** | Certain |

---

## 6. P1 Production Requirements

| # | Requirement | Evidence | Blocks |
|---|---|---|---|
| 1 | Add RLS to `venues`, `schedules`, `point_table`, `announcements`, `attendance`, `certificates`, `audit_logs` | No RLS found in any migration for these tables | Production |
| 2 | Standardize role names across profiles CHECK, RLS, RPCs, Edge Functions | 5+ naming conventions: `admin`, `judge`, `volunteer`, `participant`, `super_admin`, `tenant_admin`, `festival_admin`, `admin_leader`, `superadmin` | RLS correctness |
| 3 | Fix `listParticipants()` to scope by tenant_id | `SupabaseDatabaseProvider.ts:157-163` — no filter | Data leakage |
| 4 | Add soft-delete to participants, judges, venues, schedules | Hard deletes in provider | Data recovery |
| 5 | Add audit trail for result publication | `publishResults()` in provider | Accountability |
| 6 | Remove hard-coded years from functions | `ssf_get_category()` line 72, `get_public_leaderboard()` line 53, `festival_calendar` default | Multi-festival |
| 7 | Set up database type generation | No generated types; manual `src/types/index.ts` incomplete | Type safety |
| 8 | Add CORS restrictions to R2 Edge Function | `Access-Control-Allow-Origin: *` | Security |
| 9 | Fix `superService.ts` to not import `createClient` directly | Line 1 | Custom backend prep |
| 10 | Archive root-level test/SQL scripts | 20+ SQL, 10+ JS files in project root | Hygiene |

---

## 7. Role and Permission Model

### Roles Found in Code

| Role Name | CHECK Constraint | RLS Usage | RPC Usage | Edge Function | Status |
|---|---|---|---|---|---|
| `admin` | YES (002) | `get_my_tenant_id()`, `is_superadmin()` | `get_festival_results()` | `send-notification` | **Active** |
| `judge` | YES (002) | Via token-based access | — | — | **Active** |
| `volunteer` | YES (002) | Not visible | — | — | **Unclear** |
| `participant` | YES (002) | Not visible | — | — | **Unclear** |
| `super_admin` | NO | `030`, `044` | `get_festival_results()` | — | **Non-existent** |
| `tenant_admin` | NO | `030`, `044` | `get_festival_results()` | — | **Non-existent** |
| `festival_admin` | NO | — | `get_festival_results()` | — | **Non-existent** |
| `admin_leader` | NO | — | — | `send-notification` | **Non-existent** |
| `superadmin` | NO | — | — | `send-notification` | **Non-existent** |
| `is_superadmin` | Separate column | Primary mechanism | — | — | **Active** |

### Recommended Canonical Roles

| Role | Scope | Description |
|---|---|---|
| `super_admin` | Global | Platform-wide access; manages tenants, organisations, all festivals |
| `admin` | Tenant | Tenant-level admin; manages festival settings, participants, judges, schedules, results |
| `judge` | Schedule | Access via token; can view schedule, enter marks for assigned schedule only |
| `public` | None | Unauthenticated; can view published results, leaderboard, schedules |

### Permission Matrix

| Module | super_admin | admin | judge | public |
|---|---|---|---|---|
| Tenant CRUD | Full | Read own | — | — |
| Organisation CRUD | Full | Create children | — | Read published |
| Festival Settings | Full | Full | — | Read published |
| Participants | Full | Full | — | Read published |
| Registrations | Full | Full | — | — |
| Schedules | Full | Full | Read assigned | Read published |
| Judges | Full | Full | — | — |
| Marks | Full | Full | Own schedule only | — |
| Results | Full | Publish/Hide | Read own | Read published |
| Leaderboard | Full | Configure | — | Read |
| Certificates | Full | Generate | — | Verify |
| Notifications | Full | Send | — | Read |
| API Keys | Full | Read only | — | — |

---

## 8. Direct Supabase Dependency Map

### Approved (Inside Provider/Repository Chain)

| File | Purpose | Notes |
|---|---|---|
| `src/core/config/supabase.ts` | Client creation | Approved |
| `src/providers/auth/SupabaseAuthProvider.ts` | Auth provider | Approved |
| `src/providers/database/SupabaseDatabaseProvider.ts` | Database provider | Approved |
| `src/providers/storage/r2StorageProvider.ts` | R2 storage | Approved |
| `src/providers/storage/supabaseStorageProvider.ts` | Supabase storage | Approved |
| `src/lib/repositories/*.ts` (11 files) | All use `databaseProvider` | Approved |
| `src/services/storage/r2StorageProvider.ts` | Uses `supabase.functions.invoke` | Approved |

### Unapproved (Bypass Provider Chain)

| File | Function | Operation | Table | Replacement | Complexity | Priority |
|---|---|---|---|---|---|---|
| `src/services/fontService.ts` | `uploadFont`, `getFonts`, `deleteFont` | `.from('file_metadata')` | file_metadata | Add methods to `DatabaseProvider` | Low | P1 |
| `src/services/publicAiService.ts` | `buildPublicFestivalContext` | `.from('vw_*')` views | 5 views | Add read-only view methods to provider | Low | P2 |
| `src/services/unitProfileService.ts` | `getUnitProfile` | `.rpc('get_public_unit_profile')` | RPC | Add RPC method to provider | Low | P2 |
| `src/services/exportQueueService.ts` | `fetchQueue`, `enqueueJob`, etc. | `.from('export_jobs')`, `.from('generated_assets')` | export_jobs, generated_assets | Add methods to provider | Medium | P1 |
| `src/services/superService.ts` | `setupTenantRecords` | `createClient()` (isolated) | Supabase Auth | Create isolated auth via provider | Medium | P1 |
| `src/core/hooks/useNotificationsInbox.ts` | `useNotificationsInbox` | `.from('notification_logs')`, `.from('notifications')` | notification_logs, notifications | Add methods to provider | Low | P2 |
| `src/app/settings.tsx` | `SettingsScreen` | `.from('profiles')` | profiles | Use existing auth provider | Low | P2 |
| `src/app/api/public-ai-chat+api.ts` | `POST` | `.from('system_api_keys')`, `.from('festival_calendar')` | system_api_keys, festival_calendar | Move to Edge Function or provider | Medium | P0 |
| `src/core/contexts/NotificationContext.tsx` | `NotificationProvider` | `.from('notification_logs')`, `.channel()` | notification_logs, Realtime | Add Realtime abstraction | Medium | P2 |

**Total unapproved**: 9 files, ~25 distinct Supabase operations.

---

## 9. Provider and Repository Quality

### Modules Using the Chain Properly
- Auth: `authService.ts` → `authProvider` → `SupabaseAuthProvider`
- Participants: `participantService.ts` → `participantRepository` → `databaseProvider`
- Festival Settings: `festivalSettingsService.ts` → `festivalRepository` → `databaseProvider`
- Judges: `judgeService.ts` → `judgeRepository` → `databaseProvider`
- Schedules: `scheduleService.ts` → `scheduleRepository` → `databaseProvider`
- Leaderboard: `leaderboardService.ts` → `leaderboardRepository` → `databaseProvider`
- Results Visibility: `resultVisibilityService.ts` → `databaseProvider`
- Organisation: `organisationService.ts` → `organisationRepository` → `databaseProvider`
- Super Admin: `superService.ts` → `superRepository` → `databaseProvider` (+ isolated `createClient`)

### Quality Issues

| Issue | Evidence | Impact |
|---|---|---|
| `DatabaseProvider` has 146 methods | `DatabaseProvider.ts` | Interface is too large; should be split by domain |
| Many methods return `Record<string, unknown>` | Multiple provider methods | Loses type safety |
| No pagination standardization | All list methods return full results | Performance risk at scale |
| No transaction abstraction | Multi-step operations not transactional | Partial failure risk |
| `SupabaseDatabaseProvider` is 1278 lines | Single file | Maintenance burden |
| Error handling inconsistent | Some methods throw, some return errors | Custom backend adapter difficulty |
| Client-supplied IDs accepted | `generate_judge_token()`, import RPCs | Security risk |

---

## 10. Result, Grade, and Leaderboard Integrity

### Grade Thresholds

| Location | A+ | A | B | C | D | Source |
|---|---|---|---|---|---|---|
| `pointCalculator.ts:1-9` | ≥90% | **≥70%** | ≥60% | ≥50% | <50% | Frontend utility |
| `resultCalculator.ts:22-28` | ≥90% | **≥75%** | ≥60% | ≥50% | <50% | Frontend calculator |
| `rule.md` Section 9 | 90% | 75% | 60% | 50% | — | Documentation |
| `001_initial_schema.sql:215` | ≥90% | ≥75% | ≥60% | ≥50% | — | Schema comment |

### Points Configuration

| Source | Rank 1 | Rank 2 | Rank 3 | A+ (Ind) | A (Ind) | B (Ind) | C (Ind) |
|---|---|---|---|---|---|---|---|
| `001` defaults | 10 | 7 | 5 | 4 | 3 | 2 | 1 |
| `pointCalculator.ts` defaults | 5 | 3 | 1 | 6 | 5 | 3 | 1 |
| `points_config` table (023) | Configurable | Configurable | Configurable | 6 | 5 | 3 | 1 |

**Conflict**: `001` defaults differ from `pointCalculator.ts` defaults. The table defaults from `023` match `pointCalculator.ts`.

### Rank and Tie Rules
- `resultCalculator.ts:50-59`: Sort by average score DESC; tie-break by major criteria score
- `< 3 teams` rule: Grade only, no rank points (`resultCalculator.ts:48`)
- Configurable via `points_config.less_than_3_teams_rule`

### Authoritative Implementation
- `resultCalculator.ts` is the correct implementation (75% threshold, uses config)
- `pointCalculator.ts` is incorrect (70% threshold) and should be fixed

---

## 11. Database Migration Health

### Migration Ordering Issues
- Duplicate `018`: Two files with same number
- Duplicate `022`: Two files with same number
- Missing `063`: File exists in root, not in `supabase/migrations/`
- `018b` contains Malayalam text, not SQL — effectively a no-op

### Destructive Operations
- `008`: `DELETE FROM auth.users WHERE email = super_email` — runs on every migration
- `010`: `DELETE FROM auth.identities`, `DELETE FROM auth.users`, `DELETE FROM tenants`
- `022a`: `DROP TABLE IF EXISTS scoring_criteria CASCADE`
- `076`: DELETE + re-insert scoring rules

### Fresh Database Compatibility
- `001` through `076` should run sequentially on a fresh database
- `063_official_participant_bracket.sql` is NOT in the migration folder — must be applied manually
- `fix_notifs.sql` is NOT in the migration folder — must be applied manually

### Safe Migrations (Additive Only)
001, 002, 003, 005, 006, 009, 011, 013, 015, 016, 017, 019, 021, 023, 024, 025, 027, 028, 033, 037, 042, 044, 049, 050, 055, 057, 061, 066, 073, 074, 075

### Unsafe Migrations
- `008`: Hard-coded credentials, DELETE FROM auth.users
- `010`: Destructive tenant revocation
- `022a`: DROP CASCADE
- `076`: DELETE existing data

### Recommended Cleanup Process
1. Rename duplicate migrations (018b → 018c, 022b → 022c)
2. Move `063_official_participant_bracket.sql` into migrations
3. Move `fix_notifs.sql` into migrations
4. Archive root-level test/SQL scripts
5. Add `IF NOT EXISTS` guards where missing
6. Document which migrations have been applied in production

---

## 12. Festival Template Architecture

### Conceptual Template Structure

A festival template should contain:

| Setting | Referenced | Copied | Editable | Locked | Versioned |
|---|---|---|---|---|---|
| Template key/name | — | Yes | No | Yes | Yes |
| Enabled modules | Yes | — | Yes | After activation | Yes |
| Feature flags | Yes | — | Yes | No | Yes |
| Category presets | Yes | Yes | Yes | No | Yes |
| Item presets | Yes | Yes | Yes | No | Yes |
| Scoring presets | Yes | Yes | Yes | No | Yes |
| Points config | Yes | Yes | Yes | No | Yes |
| Grade thresholds | Yes | Yes | Yes | No | Yes |
| Role presets | Yes | — | Yes | No | Yes |
| Dashboard config | Yes | — | Yes | No | Yes |
| Navigation config | Yes | — | Yes | No | Yes |
| Schedule limits | Yes | — | Yes | No | Yes |
| Certificate presets | Yes | Yes | Yes | No | Yes |
| Report presets | Yes | — | Yes | No | Yes |

### Sahithyotsav → Huge/Advanced Template Conversion

Current Sahithyotsav features map to:
- **Valid for template**: Categories (LP/UP/HS/HSS/JR/SR/GN/CA), items (183), scoring rules, points config, grade thresholds, festival calendar, schedule management, judge management, mark entry, result calculation, leaderboard, communication, public pages, Poster Studio
- **Needs correction**: Hard-coded years, grade inconsistency, RLS bypasses, role model
- **Should be optional**: AI chatbot, chest card generation, code letter system
- **Should be generic**: Import system (currently 7 category-specific variants)

---

## 13. Custom Backend Readiness

### Work That Can Begin Immediately
1. Project skeleton (Fastify/NestJS + TypeScript)
2. Shared domain types (extract from `src/types/index.ts`)
3. API error format specification
4. Authentication token verification prototype (verify Supabase JWT)
5. R2 provider (reuse Edge Function logic)
6. Logging infrastructure
7. Health endpoint

### Work Blocked by Architecture Decisions
1. Grading — need to resolve 70% vs 75% conflict
2. Role model — need canonical roles
3. Result publication — need audit trail design
4. Festival ownership — need festival switcher design
5. Soft delete — need retention period decision
6. Database schema finalization — need RLS completion first

### Work Blocked by Security Fixes
- mark_entries, judge_tokens, system_api_keys, organisations, participants — must not migrate until P0 issues fixed

### Target Custom Backend Architecture
```
Custom API (Fastify/NestJS)
  → Domain Services (pure business logic)
  → Custom PostgreSQL Repositories (Drizzle/Prisma)
  → PostgreSQL (same database, different access pattern)
  → Cloudflare R2 (shared storage)
```

---

## 14. Backend Stack Comparison

| Criteria | Fastify | NestJS | FastAPI |
|---|---|---|---|
| TypeScript native | YES | YES | NO (Python) |
| Shared types with Expo | YES | YES | Requires codegen |
| Learning curve | Low | Medium | Low (if Python known) |
| Background jobs | Plugin ecosystem | Built-in (BullMQ) | Celery/ARQ |
| R2 integration | AWS SDK | AWS SDK | boto3 |
| Supabase Auth verification | jose library | jose library |PyJWT |
| Complex transactions | Raw SQL | Raw SQL/Prisma | Raw SQL/SQLAlchemy |
| Migration tooling | Drizzle | Prisma/Drizzle | Alembic |
| Testing | Vitest/Jest | Jest | pytest |
| Resource usage | Very low | Medium | Medium |
| Development speed | Fast | Medium | Fast |
| Future contributors | High (JS ecosystem) | High (JS ecosystem) | Medium |

### Recommendation

**Primary**: Fastify + Drizzle
- Fastest startup, lowest overhead, simplest mental model
- Drizzle gives type-safe SQL with migration tooling
- Matches existing TypeScript codebase perfectly
- Easy to find contributors

**Fallback**: NestJS + Prisma
- More structure if team grows
- Prisma has excellent DX but less control over SQL
- Better for complex module boundaries

**Not recommended**: FastAPI
- Python introduces language split
- Requires codegen for shared types
- Different testing ecosystem

---

## 15. Current, Transitional, and Target Architecture

### Current Architecture
```
Expo Frontend
  → Screens/Hooks
  → Services (partial)
  → Repositories (partial)
  → DatabaseProvider (Supabase)
  → Supabase PostgreSQL + Auth + Edge Functions
  → Cloudflare R2 (via Edge Function)
```

### Transitional Architecture
```
Expo Frontend
  → Screens/Hooks
  → Services (complete)
  → Repository Contracts (interfaces)
  → Provider Selection (env var)
  → Supabase Adapter OR Custom API Adapter
  → PostgreSQL (same DB)
  → Cloudflare R2 (shared)
```

### Target Architecture
```
Expo Frontend
  → Feature Modules
  → Domain Services
  → Repository Contracts
  → API Adapter (configured)
  → Custom Backend (Fastify + Drizzle)
  → PostgreSQL
  → Cloudflare R2
  → Background Jobs (BullMQ)
```

---

## 16. Implementation Dependency Graph

```
Phase A: Security Fixes (blocking)
  A1. Drop mark_entries bypass policy
  A2. Restrict judge_tokens SELECT
  A3. Drop organisations USING (true)
  A4. Drop participants USING (true)
  A5. Fix system_api_keys RLS
  A6. Change superadmin password

Phase B: RLS Completion (blocking)
  B1. Add RLS to venues, schedules, point_table
  B2. Standardize role names
  B3. Fix broken role references in 030, 044

Phase C: Core Fixes (blocking production)
  C1. Fix grade calculation (70% → 75%)
  C2. Remove hard-coded years
  C3. Fix listParticipants() scoping
  C4. Add audit trail for result publication

Phase D: Schema Improvements (enables multi-festival)
  D1. Add festival_id to certificates
  D2. Add festival_id to scoring_rules
  D3. Add soft-delete columns
  D4. Generate database types

Phase E: Service Layer Completion (enables custom backend)
  E1. Migrate fontService to provider
  E2. Migrate publicAiService to provider
  E3. Migrate unitProfileService to provider
  E4. Migrate exportQueueService to provider
  E5. Split DatabaseProvider into domain interfaces

Phase F: Custom Backend Foundation (parallel with E)
  F1. Project skeleton
  F2. Shared domain types
  F3. Auth verification
  F4. R2 provider
  F5. First endpoint (festival calendar)
```

**Dependencies**: A → B → C → D → E → F
**Parallel tracks**: D and E can overlap; F can start during E

---

## 17. Ten-Day Practical Plan

### Day 1: P0 Security Fixes
- **Tasks**: Drop mark_entries bypass policy; restrict judge_tokens SELECT; drop organisations USING (true); drop participants USING (true); fix system_api_keys RLS
- **Files**: New migration file; root `create_system_api_keys.sql`
- **Deliverables**: Single migration that fixes all 5 RLS issues
- **Dependencies**: None
- **Acceptance**: Verify each table's RLS with test queries
- **Rollback**: Drop the new migration's policies, restore originals
- **Risk**: Low — only dropping overly permissive policies

### Day 2: Superadmin Password + Role Standardization
- **Tasks**: Change superadmin password; create canonical role CHECK constraint; update all RLS policies to use canonical roles
- **Files**: New migration; update `030`, `044` role references
- **Deliverables**: Migration with role standardization
- **Dependencies**: Day 1
- **Acceptance**: Verify all role checks use consistent names
- **Rollback**: Restore old CHECK constraint
- **Risk**: Medium — role changes affect all RLS

### Day 3: RLS Completion
- **Tasks**: Add RLS to venues, schedules, point_table, announcements, attendance, certificates, audit_logs
- **Files**: New migration
- **Deliverables**: All tables have RLS
- **Dependencies**: Day 2
- **Acceptance**: Verify each table's RLS with test queries
- **Rollback**: Drop new policies
- **Risk**: Low — adding policies, not removing

### Day 4: Grade Fix + Hard-coded Years
- **Tasks**: Fix pointCalculator.ts 70% → 75%; remove hard-coded years from ssf_get_category, get_public_leaderboard; update festival_calendar default
- **Files**: `pointCalculator.ts`; new migration
- **Deliverables**: Consistent grading; configurable years
- **Dependencies**: None (can parallel with Days 1-3)
- **Acceptance**: Verify grade calculation matches rule.md
- **Rollback**: Revert pointCalculator.ts; revert migration
- **Risk**: Low — only fixing incorrect values

### Day 5: Query Scope Fixes
- **Tasks**: Fix listParticipants() to scope by tenant; fix exportQueueService tenant scoping; fix superService isolated client
- **Files**: `SupabaseDatabaseProvider.ts`, `exportQueueService.ts`, `superService.ts`
- **Deliverables**: All queries properly scoped
- **Dependencies**: Days 1-3
- **Acceptance**: Verify queries return only tenant-scoped data
- **Rollback**: Revert file changes
- **Risk**: Medium — may affect existing queries

### Day 6: Service Layer Completion (Part 1)
- **Tasks**: Migrate fontService to use provider; migrate publicAiService to use provider
- **Files**: `fontService.ts`, `publicAiService.ts`, `DatabaseProvider.ts`, `SupabaseDatabaseProvider.ts`
- **Deliverables**: 2 fewer direct Supabase dependencies
- **Dependencies**: Day 5
- **Acceptance**: Verify functionality unchanged
- **Rollback**: Revert file changes
- **Risk**: Low

### Day 7: Service Layer Completion (Part 2)
- **Tasks**: Migrate unitProfileService to use provider; migrate exportQueueService fully to provider
- **Files**: `unitProfileService.ts`, `exportQueueService.ts`, provider files
- **Deliverables**: 2 more direct Supabase dependencies removed
- **Dependencies**: Day 6
- **Acceptance**: Verify functionality unchanged
- **Rollback**: Revert file changes
- **Risk**: Low

### Day 8: Database Types + Schema Improvements
- **Tasks**: Generate Supabase types; add festival_id to certificates; add festival_id to scoring_rules; add soft-delete columns
- **Files**: New migration; `src/types/` updates
- **Deliverables**: Generated types; schema improvements
- **Dependencies**: Days 1-5
- **Acceptance**: TypeScript compiles without errors
- **Rollback**: Revert migration and types
- **Risk**: Low — additive changes only

### Day 9: Custom Backend Skeleton
- **Tasks**: Create Fastify project; add Drizzle config; add shared domain types; add auth verification; add health endpoint
- **Files**: New `backend/` directory
- **Deliverables**: Runnable backend skeleton
- **Dependencies**: None (can start Day 1)
- **Acceptance**: Backend starts, connects to DB, verifies auth
- **Rollback**: Delete `backend/` directory
- **Risk**: None — new code only

### Day 10: Cleanup + Documentation
- **Tasks**: Archive root-level test scripts; update README; update plan.md session log; verify all changes
- **Files**: Root directory cleanup; documentation
- **Deliverables**: Clean repository; updated docs
- **Dependencies**: All previous days
- **Acceptance**: Repository is clean and documented
- **Rollback**: N/A
- **Risk**: None

---

## 18. Implementation Batches

### Batch 1: P0 Security Repair
- **Objective**: Fix all critical RLS bypasses
- **Files affected**: New migration; `create_system_api_keys.sql`
- **Migrations required**: 1 new migration
- **Tests required**: RLS test queries for each affected table
- **Dependencies**: None
- **Risks**: Low — only dropping overly permissive policies
- **Definition of done**: All 5 P0 RLS issues resolved; superadmin password changed

### Batch 2: Role Standardization + RLS Completion
- **Objective**: Consistent role model; all tables have RLS
- **Files affected**: New migration; RLS policy updates
- **Migrations required**: 1 new migration
- **Tests required**: Role-based access tests for each table
- **Dependencies**: Batch 1
- **Risks**: Medium — role changes affect all RLS
- **Definition of done**: All tables have RLS; all role references consistent

### Batch 3: Grade Fix + Year Configurability
- **Objective**: Consistent grading; remove hard-coded years
- **Files affected**: `pointCalculator.ts`; new migration
- **Migrations required**: 1 new migration
- **Tests required**: Grade calculation verification
- **Dependencies**: None
- **Risks**: Low
- **Definition of done**: All grade calculations match rule.md; no hard-coded years

### Batch 4: Query Scope + Service Completion
- **Objective**: All queries properly scoped; all services use provider chain
- **Files affected**: `SupabaseDatabaseProvider.ts`, `fontService.ts`, `publicAiService.ts`, `unitProfileService.ts`, `exportQueueService.ts`
- **Migrations required**: None
- **Tests required**: Functional testing of each migrated service
- **Dependencies**: Batch 1
- **Risks**: Medium — may affect existing queries
- **Definition of done**: Zero direct Supabase imports outside approved providers

### Batch 5: Schema Improvements + Types
- **Objective**: Database type generation; schema improvements for multi-festival
- **Files affected**: New migration; `src/types/`
- **Migrations required**: 1 new migration
- **Tests required**: TypeScript compilation
- **Dependencies**: Batch 2
- **Risks**: Low
- **Definition of done**: Generated types available; schema ready for multi-festival

### Batch 6: Custom Backend Foundation
- **Objective**: Runnable backend skeleton with first endpoint
- **Files affected**: New `backend/` directory
- **Migrations required**: None
- **Tests required**: Backend health check; auth verification
- **Dependencies**: Batch 4
- **Risks**: None — new code only
- **Definition of done**: Backend starts, connects to DB, verifies Supabase JWT

---

## 19. Release Plan

### Phase 1: Security Repair Branch
- Create branch `fix/security-rls-batch1`
- Apply Batch 1 (P0 security fixes)
- Apply Batch 2 (role standardization)
- Apply Batch 3 (grade fix)
- Test all changes
- Merge to main

### Phase 2: Database Verification
- Verify all migrations apply cleanly to fresh database
- Verify all RLS policies work correctly
- Verify all RPCs function as expected
- Document any manual SQL that needs to be applied

### Phase 3: Supabase Staging Build
- Deploy to staging environment
- Run smoke tests
- Verify all user flows
- Performance baseline

### Phase 4: Multi-Festival Core Completion
- Apply Batch 5 (schema improvements)
- Implement festival switcher UI
- Test multi-festival scenarios

### Phase 5: Corrected Supabase Production Release
- Deploy to production
- Monitor for issues
- Verify data integrity

### Phase 6: Custom Backend Foundation
- Apply Batch 6 (backend skeleton)
- Deploy backend to staging
- Test auth verification

### Phase 7-11: (Future phases — not in scope of current plan)

### Smoke Testing Checklist
- [ ] Login as admin → dashboard loads
- [ ] Login as judge → mark entry works
- [ ] Public leaderboard displays
- [ ] Participant CRUD works
- [ ] Registration with rule engine works
- [ ] Schedule creation works
- [ ] Judge token generation/validation works
- [ ] Mark entry and finalization works
- [ ] Result publication works
- [ ] Points calculation is correct
- [ ] Leaderboard updates after publish
- [ ] Notifications send and receive
- [ ] File upload to R2 works
- [ ] Public pages load without auth

---

## 20. Human Decisions Required

| Decision | Options | Recommendation | Urgency | Blocks |
|---|---|---|---|---|
| A-grade threshold | 70% or 75% | 75% (per rule.md, matches resultCalculator.ts) | High | Grade fix |
| Canonical roles | 4-role (super_admin, admin, judge, public) or 6-role (add festival_admin, organisation_admin) | 4-role — simpler, matches current usage | High | Role standardization |
| Soft-delete retention | 30 days, 90 days, forever | 90 days — balance between recovery and storage | Medium | Schema design |
| Historical results immutable | Yes or No | Yes — publish is final; un-publish creates new version | Medium | Result audit |
| Template names | Per-festival or category-based | Category-based (milad_kids, medium_festival, huge_festival) | Low | Template system |
| Backend stack | Fastify or NestJS | Fastify — simpler, faster, matches team size | Medium | Custom backend |
| Auth migration timing | Keep Supabase Auth or migrate immediately | Keep Supabase Auth for first 6 months | Low | Custom backend |
| Festival switcher | Global or per-tenant | Per-tenant — each tenant manages their own festivals | Medium | Multi-festival UI |

---

## 21. Final Recommendation

### Does the project require a rewrite?
**No.** The architecture is sound. The provider/repository/service design is correct. The implementation has security gaps and inconsistencies that can be fixed with targeted migrations and code changes.

### Can the current architecture be repaired?
**Yes.** All P0 issues are fixable with new migrations and small code changes. The provider chain works and can support a custom backend adapter.

### Safest first implementation task
**Batch 1: P0 Security Repair.** Create a single migration that:
1. Drops the `FOR ALL USING (true)` policies on `mark_entries`, `organisations`, and `participants`
2. Restricts `judge_tokens` SELECT to authenticated admins
3. Fixes `system_api_keys` RLS

### Safest parallel custom-backend task
**Batch 6: Custom Backend Foundation.** Create a Fastify project skeleton with:
1. Shared domain types
2. Supabase JWT verification
3. Health endpoint
4. First read-only endpoint (festival calendar)

### Biggest production risk
**mark_entries RLS bypass.** Any user can modify any judge's marks. This is the single most dangerous vulnerability.

### Biggest migration risk
**Role standardization.** Changing role names affects all RLS policies, RPCs, and Edge Functions. Must be done atomically in a single migration.

### Likely release path
1. Security repair (1-2 days)
2. Staging deployment and testing (1-2 days)
3. Production release (1 day)
4. Custom backend foundation (parallel, 2-3 days)
5. Multi-festival completion (1-2 weeks)
6. Custom backend feature parity (1-2 months)

### What must not be done yet
- Do not begin custom backend feature migration until P0 issues are fixed
- Do not add new features until RLS is complete
- Do not deploy to production until grade calculation is consistent
- Do not migrate auth until custom backend JWT verification is proven

---

## 22. Evidence Index

### Critical Files Verified
| File | Lines | Finding |
|---|---|---|
| `027_judge_portal_rls_bypass.sql` | 47-62 | mark_entries RLS bypass confirmed |
| `019_judge_tokens.sql` | 20-23 | Public SELECT confirmed |
| `007_flexible_hierarchy.sql` | 48-49 |.organisations FOR ALL USING (true) confirmed |
| `004_phase5_participant_management.sql` | 38-39 | participants FOR ALL USING (true) confirmed |
| `create_system_api_keys.sql` | 19-45 | Wide-open RLS confirmed |
| `008_superadmin_setup.sql` | 12,43 | Hard-coded credentials confirmed |
| `pointCalculator.ts` | 6 | 70% threshold confirmed |
| `resultCalculator.ts` | 24 | 75% threshold confirmed |
| `030_leaderboard_settings.sql` | 59 | Non-existent role names confirmed |
| `014_fix_org_rls.sql` | 6-8 | Does NOT drop 007's policy confirmed |
| `public-ai-chat+api.ts` | 8-12 | system_api_keys readable confirmed |
| `SupabaseDatabaseProvider.ts` | 157-163 | listParticipants() unscoped confirmed |

---

## 23. Items Requiring Runtime or Production Inspection

1. Are `venues`, `schedules`, `point_table` actually missing RLS, or were policies added outside migrations?
2. Has migration `027` been applied to production?
3. What is the current state of the `system_api_keys` table — does it contain real API keys?
4. Are there any other SECURITY DEFINER functions not captured in the 76 migrations?
5. What is the actual production state of the `organisations` RLS — can any user modify organisations?
6. Has the superadmin password been changed since migration `008` was applied?
7. What is the current production festival_year — 2025 or 2026?

---

*End of Phase 3 Architecture & Migration Deep Report*
