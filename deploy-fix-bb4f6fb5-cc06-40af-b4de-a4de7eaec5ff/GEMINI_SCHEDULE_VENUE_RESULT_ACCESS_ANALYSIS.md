# GEMINI SCHEDULE, VENUE AND RESULT ACCESS ANALYSIS

## 1. Repository State
* **Current branch**: `main`
* **Current commit**: `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
* **Git working-tree status**: Clean for tracked files; 1 untracked file (`UPDATED_PROJECT_REVALIDATION_REPORT.md`)
* **Current highest migration number**: `092_harden_mark_entry_validation.sql`

## 2. Scope and Excluded Areas
**Included**: Schedules access, Venues access, Public schedule visibility, Authenticated/private schedule visibility, Results read access, Published vs. unpublished results, Festival calendar access, and Points configuration access.
**Excluded (Do not touch)**: Judge tokens, Judge approval, Judge registrations, Judge marks, `mark_entries`, Mark validation, Judge audit, Advancement schema, Points-recipient model, Imports, Tenant onboarding, and Any-Festival architecture.

## 3. Existing Parallel-Agent Changes Detected
* Only the untracked `UPDATED_PROJECT_REVALIDATION_REPORT.md` file was detected.
* No source code modifications or uncommitted changes to tracked files were detected.
* *Note: The other agent may be actively drafting new migrations or updating judge-related code. All analysis relied on committed repository history.*

## 4. Schedule Access Paths
* **Tables**: `schedules`
* **RLS**: Row Level Security is **NOT ENABLED** on `schedules` anywhere in the migration history.
* **Policies**: No policies exist for `schedules`.
* **RPCs/Views**: Various RPCs join against schedules (e.g., `get_festival_results`), but direct table access is not blocked. 
* **Frontend**: Public timetables and admin pages query this data.
* **Verdict**: Fully exposed. The lack of RLS means public anonymous users and authenticated users from any tenant can read and modify all fields on `schedules` via the PostgREST API if default grants apply.

## 5. Schedule Field Classification
* **Publicly safe**: `id`, `item_id`, `venue_id`, `start_time`, `end_time` (only for published schedules/festivals)
* **Authenticated admin only**: `status` (internal readiness state), `buffer_minutes`
* **Tenant/hierarchy scoped**: `tenant_id`, `festival_id`, `judge_panel_id` (contains judge identities), expected judge count, operational notes, and **all fields of unpublished schedules**
* **Internally sensitive**: Direct assignments linking unpublished judge identities to schedules.

## 6. Venue Access Paths
* **Tables**: `venues`
* **RLS**: Row Level Security is **NOT ENABLED** on `venues`.
* **Policies**: No policies exist for `venues`.
* **Verdict**: Fully exposed. The lack of RLS means anyone can anonymously read or mutate venues across all tenants. A public venue name is needed for a published timetable, but this does not justify unrestricted direct table access or CRUD operations.

## 7. Result Access Paths
* **Tables**: `results`
* **RLS**: Enabled (`ALTER TABLE results ENABLE ROW LEVEL SECURITY;` in `018_phase5_judges_marks_results.sql` and `020_complete_judge_system.sql`).
* **Policies**: 
  * `CREATE POLICY "Enable read access for all authenticated users" ON results FOR SELECT TO authenticated USING (true);`
  * `CREATE POLICY "Enable all access for admins based on tenant_id" ON results FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());`
* **Verdict**: **TOO BROAD AUTHENTICATED ACCESS**, **SIBLING TENANT LEAK**, and **UNRELATED TENANT LEAK**. The `USING (true)` policy allows any authenticated user from any tenant to read all private/draft results globally.
* **Public Read Paths**: Facilitated via `get_public_leaderboard` RPC which enforces visibility rules (`published` status), which is intended behavior, but direct table access undermines it.

## 8. Published vs Private Result Boundary
| Data/operation                | Public anonymous | Authenticated own tenant | Parent hierarchy admin | Sibling tenant | Unrelated tenant |
| ----------------------------- | ---------------: | -----------------------: | ---------------------: | -------------: | ---------------: |
| Published schedule fields     |             Read |                     Read |                   Read |           Read |             Read |
| Unpublished schedules         |        No Access |                     Read |                   Read |      No Access |        No Access |
| Schedule create/update/delete |        No Access |                    Write |                  Write |      No Access |        No Access |
| Public venue name             |             Read |                     Read |                   Read |           Read |             Read |
| Venue CRUD                    |        No Access |                    Write |                  Write |      No Access |        No Access |
| Published results             |             Read |                     Read |                   Read |           Read |             Read |
| Draft/private results         |        No Access |                     Read |                   Read |      No Access |        No Access |
| Result publication            |        No Access |                    Write |                  Write |      No Access |        No Access |

## 9. Festival Calendar Policy Status
* **RLS**: Enabled on `festival_calendar` (`011_multi_tenant_rls.sql`).
* **Policies**: Only a `SELECT` policy exists (`USING (tenant_id IS NULL OR tenant_id = public.get_my_tenant_id() OR public.is_superadmin())`).
* **Verdict**: **Frontend write behaviors will fail**. Because there are no `INSERT`, `UPDATE`, or `DELETE` policies, admin attempts to mutate the festival calendar directly via the API will be blocked by RLS. 

## 10. Points Configuration Isolation Status
* **RLS**: Row Level Security is **NOT ENABLED** on the core `points_config` table (only on `points_config_versions`).
* **Policies**: Missing for `points_config`.
* **Verdict**: **Cross-tenant configuration access vulnerability**. Anyone can read or modify the active points configurations globally due to the lack of RLS on the main table.

## 11. Parent–Child Hierarchy Considerations
* When locking down `results`, `schedules`, and `venues`, we must ensure that a parent organization (e.g., district admin) can read and write the records of their child organizations (e.g., unit/sector). 
* The `get_public_leaderboard` RPC explicitly handles hierarchy properly for reads, but direct table RLS policies for `results` currently do not factor in hierarchy correctly, they just rely on `tenant_id` or default to `true`.

## 12. Confirmed Vulnerabilities
1. `schedules` lacks RLS (anonymous operational read/write access).
2. `venues` lacks RLS (anonymous venue mutation).
3. `results` has a SELECT policy with `USING (true)`, leaking draft/private results to sibling/unrelated tenants.
4. `points_config` lacks RLS (cross-tenant configuration leak).
5. `festival_calendar` lacks write policies (blocks legitimate admin edits).

## 13. Findings That Are Intentional Product Behaviour
* The RPC `get_public_leaderboard` and `get_festival_results` return correct, scoped data depending on published flags and caller roles.
* Public published results and schedules being accessible (as long as they don't expose operational draft data).
* Superadmin unrestricted access.

## 14. Findings Requiring Product Decisions
* Should public timetables load data through direct `SELECT` on `schedules` (requiring complex RLS policies filtering by published flags and fields), or should we introduce a dedicated `get_published_schedule` RPC/view to safely project only public fields? (The design below assumes RLS policy adjustments for direct access, but an RPC is structurally safer).

## 15. Minimal Balanced Fix Design
* Enable RLS on `schedules`, `venues`, and `points_config`.
* Implement strict tenant-scoped policies on these tables for CRUD operations.
* Remove the `USING (true)` policy on `results` and replace it with a policy that allows reads if `tenant_id = get_my_tenant_id()` OR if the result is `published = true AND result_status = 'published'`. Parent hierarchy access should be added via an RPC or a recursive org-tree check.
* Add `INSERT`/`UPDATE`/`DELETE` policies for `festival_calendar` scoped to tenant admins.

## 16. Proposed Batch B1
* **Exact Objective**: Secure `schedules` and `venues` from anonymous mutation and isolate them by tenant, while keeping published public schedules viewable.
* **Likely Files**: `supabase/migrations/093_secure_schedules_venues.sql`
* **Likely Migration Scope**: 
  * `ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;`
  * `ALTER TABLE venues ENABLE ROW LEVEL SECURITY;`
  * Create read policies for public (only for active/published festivals) and admins.
  * Create write policies for admins on their own `tenant_id`.
* **Dependencies**: None.
* **Regression Risks**: Public timetables might break if the RLS policy is too strict or the frontend queries fields that become restricted.
* **Required Tests**: Tests 1-10.
* **Independent**: Yes.

## 17. Proposed Batch B2
* **Exact Objective**: Restrict `results` reads so that authenticated users cannot see draft/private results belonging to sibling or unrelated tenants.
* **Likely Files**: `supabase/migrations/094_secure_results_read_boundary.sql`
* **Likely Migration Scope**: 
  * Drop `Enable read access for all authenticated users` on `results`.
  * Add a policy permitting `anon`/`authenticated` to read ONLY `published = true AND result_status = 'published'`.
  * Add a policy for `authenticated` tenant admins to read/write all results for their `tenant_id`.
* **Dependencies**: None.
* **Regression Risks**: Admins in parent hierarchies might lose access to child results if the policy relies only on `tenant_id`.
* **Required Tests**: Tests 11-15.
* **Independent**: Yes.

## 18. Proposed Batch B3
* **Exact Objective**: Enable RLS on `points_config` and add missing write policies for `festival_calendar`.
* **Likely Files**: `supabase/migrations/095_align_calendar_points_config.sql`
* **Likely Migration Scope**: 
  * `ALTER TABLE points_config ENABLE ROW LEVEL SECURITY;`
  * Add tenant-scoped CRUD policies for `points_config`.
  * Add tenant-scoped `INSERT`, `UPDATE`, `DELETE` policies for `festival_calendar`.
* **Dependencies**: None.
* **Regression Risks**: Existing admin interfaces could encounter caching issues upon policy deployment, but it will fundamentally fix failing writes.
* **Required Tests**: Tests 16-18.
* **Independent**: Yes.

## 19. Required Tests
1. Anonymous can read only approved published schedule fields.
2. Anonymous cannot read unpublished/internal schedule data.
3. Anonymous cannot create/update/delete schedules.
4. Own-tenant admin can manage schedules.
5. Sibling tenant cannot manage schedules.
6. Unrelated tenant cannot read private schedules.
7. Public timetable still displays venue information.
8. Anonymous cannot modify venues.
9. Own-tenant admin can manage applicable venues.
10. Sibling/unrelated tenant cannot manage venues.
11. Public can read published results only.
12. Public cannot read draft/private results.
13. Own-tenant admin can read required private results.
14. Legitimate parent hierarchy result access is preserved.
15. Sibling/unrelated authenticated users cannot read private results.
16. Festival calendar admin write path works under intended authorization.
17. Points configuration is isolated by tenant.
18. Superadmin access remains intentional and explicit.

## 20. Risks and Dependencies
* **Risks**: Modifying RLS on highly-trafficked tables (`schedules`, `results`) can break frontend components if they depend on direct joins against now-protected rows.
* **Dependencies**: Any fix must not intersect with the judge tokens/marks work being handled by the parallel agent.

## 21. Recommended Next Implementation Order
1. **Batch B1** (Schedules and Venues)
2. **Batch B3** (Festival Calendar & Points Config)
3. **Batch B2** (Results Boundary, requires the most care for hierarchy logic)

## 22. Confirmation of No Source or Database Changes
I confirm that absolutely no source files, frontend code, database migrations, configuration, or environment files were modified during this read-only analysis. The Git working directory was untouched, and no parallel-agent work was disturbed.
