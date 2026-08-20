# Phase 5 — Live Runtime Verification & Security Risk Report

**Date**: 2026-07-24  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Environment**: Live Production Supabase PostgreSQL Database  
**Audit Status**: **CRITICAL RUNTIME VULNERABILITIES & DATA MISMATCHES CONFIRMED — OPERATIONAL FREEZE IN EFFECT**  

---

> [!CAUTION]
> ### 🛑 OPERATIONAL FREEZE DIRECTIVE
> **DO NOT PUBLISH OR TRUST ANY FESTIVAL RESULTS.**  
> **DO NOT APPLY ANY DATABASE MUTATIONS OR FIXES UNTIL THE FINAL RECOVERY PLAN IS APPROVED.**  
> 
> Empirical runtime audit results confirm active RLS security bypasses allowing unrestricted anonymous/authenticated mark entries and multi-tenant data leaks, alongside 245 total relational data boundary mismatches across live competition records.

---

## 1. Executive Summary of Live Runtime Audit

Execution of `database_readonly_verification_final.sql` (specifically **Part D Active RLS Enforcement Join `D.1`** and **Part F Boundary Integrity `F.30–F.36`**) on the live Supabase PostgreSQL database revealed critical security vulnerabilities and active data integrity corruptions:

1. **Anonymous & Public Mark Manipulation (P0-1 Security Vulnerability)**:
   `mark_entries_insert_policy` and `mark_entries_update_policy` grant `INSERT` and `UPDATE` permissions to `{anon, authenticated}` roles with `WITH CHECK (true)` and `USING (true)`. Any anonymous internet user or logged-in user can overwrite marks for any competition.
2. **Multi-Tenant Data Isolation Bypasses (P0 Tenant Leak)**:
   Over 15 core tables (`tenants`, `organisations`, `registrations`, `results`, `categories`, `festival_calendar`, `items`, `schedules`, `points_config`, `point_table`, `venues`, `certificates`, `attendance`, `announcements`, `audit_logs`) contain duplicate generic fallback policies (`*_select_policy`, `*_update_policy`, `*_delete_policy`, `*_insert_policy`) configured with `roles = {authenticated}` and `USING (true)`. These override tenant-scoped policies and grant cross-tenant access.
3. **245 Relational Competition Mismatches (Data Integrity Corruption)**:
   - **120 Mark-Context Festival Mismatches**: Marks recorded where the judge, schedule, registration, or item belong to conflicting festivals.
   - **31 Judge-Schedule Mismatches**: Judges assigned to competition schedules in a different festival.
   - **35 Schedule-Item Mismatches**: Schedules linking items from one festival to a schedule in another festival.
   - **59 Registration Tenant Mismatches**: Registrations linking a participant from Tenant A to a registration under Tenant B.

---

## 2. Live Runtime RLS Audit Analysis (D.1 Execution Findings)

### 2.1 Critical P0 Public & Anonymous Write Access
The live catalog inspection confirmed that `mark_entries` permits unrestricted public/anon mutation:

```json
{
  "table_name": "mark_entries",
  "policyname": "mark_entries_insert_policy",
  "roles": "{anon,authenticated}",
  "operation": "INSERT",
  "with_check_expression": "true",
  "rls_enforcement_status": "RLS ENABLED — ACTIVE POLICY ENFORCED"
},
{
  "table_name": "mark_entries",
  "policyname": "mark_entries_update_policy",
  "roles": "{anon,authenticated}",
  "operation": "UPDATE",
  "using_expression": "true",
  "with_check_expression": "true",
  "rls_enforcement_status": "RLS ENABLED — ACTIVE POLICY ENFORCED"
}
```

* **Root Cause in Repository**: `supabase/migrations/027_judge_portal_rls_bypass.sql` (lines 47–62) created permissive public policies intended for anonymous judge portal scoring without adding schedule/token validation inside the policy expression.
* **Impact**: Fraudulent marks can be injected or existing marks altered by any network client without passing through the judge token validation RPC.

---

### 2.2 Critical P0 Multi-Tenant Policy Collisions
The live catalog contains duplicate policies created by earlier prototyping migrations (e.g. `007_flexible_hierarchy.sql`, `fix_rls.sql`, `034_combined_run.sql`) that coexist with scoped multi-tenant policies (`011_multi_tenant_rls.sql`).

In PostgreSQL RLS, `PERMISSIVE` policies combine with **OR** logic. If **any** permissive policy evaluates to `true`, access is granted.

#### Key Policy Collision Examples from Live Database:

| Table | Scoped Tenant Policy | Duplicate Permissive Bypass Policy | Live Security Result |
|---|---|---|---|
| `registrations` | `registrations_select_policy` (`is_org_visible(organisation_id)`) | `Admins can manage their own registrations` (`USING (true) WITH CHECK (true)`) | **TENANT ISOLATION BROKEN** (Any auth user can read/write all registrations) |
| `results` | *(None)* | `results_select_policy`, `results_insert_policy`, `results_update_policy`, `results_delete_policy` (`USING (true)`) | **TENANT ISOLATION BROKEN** (Unrestricted authenticated access to all scores) |
| `tenants` | `Users can see their own tenant record` (`id = get_my_tenant_id()`) | `tenants_select_policy`, `tenants_update_policy`, `tenants_delete_policy` (`USING (true)`) | **TENANT ISOLATION BROKEN** (Any auth user can update/delete any tenant) |
| `categories` | `View local or global categories` (`tenant_id IS NULL OR tenant_id = get_my_tenant_id()`) | `categories_select_policy`, `categories_update_policy`, `categories_delete_policy` (`USING (true)`) | **CROSS-TENANT LEAK** |
| `festival_calendar` | `View local or global calendar` | `festival_calendar_select_policy`, `festival_calendar_update_policy`, `festival_calendar_delete_policy` (`USING (true)`) | **CROSS-TENANT LEAK** |
| `items` | `View local or global items` | `items_select_policy`, `items_update_policy`, `items_delete_policy` (`USING (true)`) | **CROSS-TENANT LEAK** |
| `schedules` | `Admins can manage their own schedules` | `Allow all on schedules`, `schedules_select_policy`, `schedules_update_policy` (`USING (true)`) | **CROSS-TENANT LEAK** |
| `judges` | `Admins can manage judges` | `Public can identify judges for login` (`FOR SELECT TO anon USING (true)`), `judges_insert_policy`, `judges_update_policy` (`USING (true)`) | **PUBLIC ANONYMOUS ENUMERATION & UNRESTRICTED AUTH MUTATION** |

---

## 3. Live Runtime Data Boundary Mismatches (Part F Audit Findings)

The execution of boundary integrity checks (`F.30`, `F.32`, `F.36`) returned concrete empirical counts of data corruption across the live dataset:

```text
┌─────────────────────────────────────────────────────────────┬───────┐
│ Boundary Check Description                                  │ Count │
├─────────────────────────────────────────────────────────────┼───────┤
│ Mark-Context Festival Mismatches (F.36)                     │  120  │
│ Judge-Schedule Festival Mismatches (F.36)                   │   31  │
│ Schedule-Item Festival Mismatches (F.32 / F.36)            │   35  │
│ Registration Tenant Mismatches (F.30)                       │   59  │
├─────────────────────────────────────────────────────────────┼───────┤
│ TOTAL CONFIRMED DATA BOUNDARY MISMATCHES                    │  245  │
└─────────────────────────────────────────────────────────────┴───────┘
```

### 3.1 Impact of Data Mismatches
1. **120 Mark Mismatches**: Scores recorded by judges assigned to Festival A were attached to schedules or items belonging to Festival B. If published, leaderboards for both festivals will calculate corrupted team and individual totals.
2. **31 Judge-Schedule Mismatches**: Judges were assigned to evaluate schedules outside their designated festival boundary.
3. **35 Schedule-Item Mismatches**: Competition schedules point to items belonging to a different festival, distorting venue timelines and item scores.
4. **59 Registration Mismatches**: Participants registered under Tenant A have registration records bound to Tenant B, causing cross-tenant scoreboard leakage.

---

## 4. Operational Risk & Freeze Guidelines

### Why Results Cannot Be Published
* **Unvalidated Mark Entries**: Unrestricted `mark_entries` RLS policies mean mark entries could have been modified outside the official scoring interface.
* **Corrupted Scores**: 120 mark-context mismatches mean current raw scores reflect cross-festival data contamination.
* **Leaderboard Distortion**: Publishing leaderboards or certificates under current conditions would produce false winners and breach competition integrity.

### Strict Maintenance Directive
* **No Database Fixes Yet**: Do not run `DELETE`, `UPDATE`, or `DROP POLICY` statements manually.
* **No Production Code Alterations**: Do not deploy new migrations until Stage 2 (Architecture Alignment) and Stage 3 (Corrective Migration Batching) are completed.

---

## 5. Next Steps Workflow

```text
Step 1: Complete Part F & Part G Summaries  ==> [IN PROGRESS] Save remaining query outputs
Step 2: Architecture & Rule Alignment     ==> Align on multi-festival & tenant boundaries
Step 3: Draft Batch 1 Security Migrations ==> Clean duplicate TRUE policies & restrict mark_entries
Step 4: Draft Batch 2 Data Repair        ==> Re-parent or clean the 245 mismatched records
Step 5: Runtime Re-Verification          ==> Execute V4.3 verification to confirm zero errors
Step 6: Lift Operational Freeze          ==> Re-calculate leaderboards & publish validated results
```
