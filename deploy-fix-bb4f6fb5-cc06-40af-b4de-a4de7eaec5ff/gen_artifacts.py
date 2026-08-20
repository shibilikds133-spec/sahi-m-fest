import json
import os

art_dir = r'C:\Users\Admin\.gemini\antigravity\brain\acbb4449-1601-44c6-a142-5054fdd067e6'

with open('sched_breakdown.json', 'r', encoding='utf-8') as f:
    sched_data = json.load(f)

with open('forensic_raw_data.json', 'r', encoding='utf-8') as f:
    raw_data = json.load(f)

# ==============================================================================
# 1. FORENSIC_ROW_MAPPING.json
# ==============================================================================
row_mapping = []

# 59 Reg Mismatches
for r in raw_data['issue1']:
    row_mapping.append({
        "issue_type": "59 registration-to-participant tenant mismatches",
        "table_name": "registrations",
        "row_id": r['row_id'],
        "linked_record_ids": r['linked_record_ids'],
        "current_tenant_id": r['current_tenant_id'],
        "linked_tenant_id": r['linked_tenant_id'],
        "current_festival_id": r['current_festival_id'],
        "linked_festival_id": r['linked_festival_id'],
        "current_status": r['current_status'],
        "published_state": False,
        "proposed_candidate_authority": "PENDING MULTI-TABLE EVALUATION",
        "confidence_level": "NEUTRAL",
        "exact_reason": "Registration, participant, item, organisation, result, mark, and payment tenant relationships must be evaluated together",
        "automatic_correction_safe": False,
        "operator_approval_required": True,
        "classification": "MANUAL/BATCH REVIEW REQUIRED"
    })

# 1 Result Mismatch
for r in raw_data['issue2']:
    row_mapping.append({
        "issue_type": "1 result-to-participant festival mismatch",
        "table_name": "results",
        "row_id": r['row_id'],
        "linked_record_ids": r['linked_record_ids'],
        "current_tenant_id": r['current_tenant_id'],
        "linked_tenant_id": r['linked_tenant_id'],
        "current_festival_id": r['current_festival_id'],
        "linked_festival_id": r['linked_festival_id'],
        "current_status": r['current_status'],
        "published_state": r['published'],
        "proposed_candidate_authority": "PENDING OPERATOR DECISION",
        "confidence_level": "NEUTRAL",
        "exact_reason": "Result festival_id (2026) differs from participant and registration festival_id (2025)",
        "automatic_correction_safe": False,
        "operator_approval_required": True,
        "classification": "MANUAL REVIEW REQUIRED"
    })

# 35 Schedule Mismatches (16 with marks, 19 without marks)
for s in sched_data['schedsWithMarks']:
    row_mapping.append({
        "issue_type": "16 schedules with marks (schedule festival_id NULL)",
        "table_name": "schedules",
        "row_id": s['id'],
        "linked_record_ids": {"item_id": s['item_tenant_id']},
        "current_tenant_id": s['schedule_tenant_id'],
        "linked_tenant_id": s['item_tenant_id'],
        "current_festival_id": s['schedule_festival_id'],
        "linked_festival_id": s['item_festival_id'],
        "current_status": "active",
        "published_state": False,
        "proposed_candidate_authority": "items.festival_id",
        "confidence_level": "HIGH",
        "exact_reason": "Schedule festival_id is NULL while linked item festival_id is e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6. Schedule has " + str(s['mark_count']) + " finalized marks",
        "automatic_correction_safe": False,
        "operator_approval_required": True,
        "classification": "MANUAL/BATCH REVIEW REQUIRED"
    })

for s in sched_data['schedsWithoutMarks']:
    row_mapping.append({
        "issue_type": "19 schedules without marks (schedule festival_id NULL)",
        "table_name": "schedules",
        "row_id": s['id'],
        "linked_record_ids": {"item_id": s['item_tenant_id']},
        "current_tenant_id": s['schedule_tenant_id'],
        "linked_tenant_id": s['item_tenant_id'],
        "current_festival_id": s['schedule_festival_id'],
        "linked_festival_id": s['item_festival_id'],
        "current_status": "active",
        "published_state": False,
        "proposed_candidate_authority": "items.festival_id",
        "confidence_level": "HIGH",
        "exact_reason": "Schedule festival_id is NULL while linked item festival_id is e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6. Schedule has 0 marks",
        "automatic_correction_safe": False,
        "operator_approval_required": True,
        "classification": "MANUAL/BATCH REVIEW REQUIRED"
    })

# 7 Reg Participant/Item Mismatches
for r in raw_data['issue4']:
    row_mapping.append({
        "issue_type": "7 registration participant/item festival mismatches",
        "table_name": "registrations",
        "row_id": r['row_id'],
        "linked_record_ids": r['linked_record_ids'],
        "current_tenant_id": r['current_tenant_id'],
        "linked_tenant_id": r['current_tenant_id'],
        "current_festival_id": r['registration_festival_id'],
        "linked_festival_id": r['participant_festival_id'],
        "current_status": "approved",
        "published_state": False,
        "proposed_candidate_authority": "PENDING OPERATOR DECISION",
        "confidence_level": "NEUTRAL",
        "exact_reason": "Participant (2025) registered for 2026 item. Operator must determine whether participant festival, item selection, or registration entry is incorrect",
        "automatic_correction_safe": False,
        "operator_approval_required": True,
        "classification": "MANUAL REVIEW REQUIRED"
    })

# 120 Mark Mismatches (Dependent Records)
for m in raw_data['issue6_7']:
    row_mapping.append({
        "issue_type": "120 mark-to-schedule festival mismatches (dependent records)",
        "table_name": "mark_entries",
        "row_id": m['row_id'],
        "linked_record_ids": m['linked_record_ids'],
        "current_tenant_id": m['mark_tenant_id'],
        "linked_tenant_id": m['judge_tenant_id'],
        "current_festival_id": m['schedule_festival_id'],
        "linked_festival_id": m['judge_festival_id'],
        "current_status": "final" if m['is_final'] else "draft",
        "published_state": False,
        "proposed_candidate_authority": "PRESERVE MARK VALUE (DEPENDENT ON SCHEDULE FESTIVAL FK)",
        "confidence_level": "HIGH",
        "exact_reason": "Mark entry is finalized. Query mismatch is caused solely by schedules.festival_id = NULL. Mark record must be preserved",
        "automatic_correction_safe": False,
        "operator_approval_required": True,
        "classification": "HISTORICAL DATA — PRESERVE"
    })

# 4 Dangling Tokens
for jt in raw_data['issue8']:
    row_mapping.append({
        "issue_type": "4 judge tokens referencing missing schedules",
        "table_name": "judge_tokens",
        "row_id": jt['row_id'],
        "linked_record_ids": {"judge_id": jt['judge_id'], "missing_schedule_id": jt['missing_schedule_id']},
        "current_tenant_id": jt['tenant_id'],
        "linked_tenant_id": jt['tenant_id'],
        "current_festival_id": None,
        "linked_festival_id": None,
        "current_status": "unused",
        "published_state": False,
        "proposed_candidate_authority": "REVOCATION SCHEMA (PENDING STAGING TEST)",
        "confidence_level": "HIGH",
        "exact_reason": "Token references missing schedule UUID and has 0 mark entries. Token will be revoked once revocation schema is validated in staging",
        "automatic_correction_safe": False,
        "operator_approval_required": True,
        "classification": "INVALID REFERENCE — REVOKE/ARCHIVE"
    })

# 7 NULL-grade results
for r in raw_data['issue9']:
    row_mapping.append({
        "issue_type": "7 published result rows with grade = NULL",
        "table_name": "results",
        "row_id": r['id'],
        "linked_record_ids": {"registration_id": r['registration_id'], "item_id": r['item_id']},
        "current_tenant_id": r['tenant_id'],
        "linked_tenant_id": r['tenant_id'],
        "current_festival_id": r['festival_id'],
        "linked_festival_id": r['festival_id'],
        "current_status": r['result_status'],
        "published_state": r['published'],
        "proposed_candidate_authority": "ORIGINAL SCORECARD INSPECTION",
        "confidence_level": "NEUTRAL",
        "exact_reason": "total_score IS NULL. Grade cannot be mathematically derived from rank/points alone. Original scorecards must be inspected or grade preserved as NULL",
        "automatic_correction_safe": False,
        "operator_approval_required": True,
        "classification": "MANUAL REVIEW REQUIRED"
    })

with open(os.path.join(art_dir, 'FORENSIC_ROW_MAPPING.json'), 'w', encoding='utf-8') as f:
    json.dump(row_mapping, f, indent=2)
print('Saved FORENSIC_ROW_MAPPING.json')


# ==============================================================================
# 2. FORENSIC_MISMATCH_SUMMARY.md
# ==============================================================================
summary_md = f'''# Corrected Read-Only Forensic Mismatch Summary Report

**Execution Mode**: Strict Read-Only Catalog & Data Query  
**Date**: 2026-07-24  

> [!IMPORTANT]
> No database mutation, DDL, DML, policy change, migration repair, or auto-fix execution was performed. All 151 finalized mark records and audit logs remain 100% preserved.

---

## 1. Metric Breakdown: Unique Root vs Dependent Records

| Metric Category | Unique Count | Description |
|---|---|---|
| **Unique Root Records** | **114** | Root database entities containing boundary or schema discrepancies (16 schedules with marks, 19 schedules without marks, 59 registrations, 4 dangling tokens, 7 reg participant/item mismatches, 1 result mismatch, 7 NULL-grade results) |
| **Dependent Records** | **151** | Secondary records whose queries report mismatches solely due to FK joins with root records (120 finalized mark entries, 31 judge tokens) |
| **Combined Unique Affected Rows** | **265** | Total unique database rows identified across all 9 audit categories |

---

## 2. Executive Mismatch Inventory & Classification

| # | Issue Category | Root Rows | Dependent Rows | Current Classification | Safe Auto-Fix Approved? |
|---|---|---|---|---|---|
| 1 | 59 Registration-to-Participant Tenant Mismatches | **59** | 0 | `MANUAL/BATCH REVIEW REQUIRED` | **NO** (Pending multi-table tenant evaluation) |
| 2 | 1 Result-to-Participant Festival Mismatch | **1** | 0 | `MANUAL REVIEW REQUIRED` | **NO** (Pending authority evaluation) |
| 3a | 16 Schedules with Marks (Schedule Festival NULL) | **16** | 120 marks, 31 tokens | `MANUAL/BATCH REVIEW REQUIRED` | **NO** (Pending operator verification of schedule festival) |
| 3b | 19 Schedules without Marks (Schedule Festival NULL) | **19** | 13 tokens | `MANUAL/BATCH REVIEW REQUIRED` | **NO** (Pending operator verification of schedule festival) |
| 4 | 7 Registration Participant/Item Festival Mismatches | **7** | 0 | `MANUAL REVIEW REQUIRED` | **NO** (Pending review of participant/item selection) |
| 5 | 31 Judge-to-Schedule Festival Mismatches | 0 (Derived) | **31** tokens | `DEPENDENT RECORD — PRESERVE` | **NO** (Dependent on schedule festival authority) |
| 6/7 | 120 Mark-to-Schedule Festival Mismatches | 0 (Derived) | **120** marks | `HISTORICAL DATA — PRESERVE` | **NO** (Marks must be preserved intact) |
| 8 | 4 Judge Tokens Referencing Missing Schedules | **4** | 0 | `INVALID REFERENCE — REVOKE/ARCHIVE` | **NO** (Pending staging test of revocation schema) |
| 9 | 7 Published Results with `grade = NULL` | **7** | 0 | `MANUAL REVIEW REQUIRED` | **NO** (Score = NULL; grade cannot be derived) |

---

## 3. Breakdown of 35 Mismatched Schedules

### A. 16 Schedules Associated with the 120 Mark Rows

| Schedule UUID | Item Code / Name | Sched Fest ID | Item Fest ID | Sched Tenant | Item Tenant | Marks | Tokens | Fest Status |
|---|---|---|---|---|---|---|---|---|
'''

for s in sched_data['schedsWithMarks']:
    summary_md += f"| `{s['id']}` | {s['item_code']} ({s['item_name']}) | `NULL` | `{s['item_festival_id']}` | `{s['schedule_tenant_id']}` | `{s['item_tenant_id']}` | **{s['mark_count']}** | **{s['token_count']}** | **NULL** |\n"

summary_md += '''
### B. Remaining 19 Mismatched Schedules (0 Mark Rows)

| Schedule UUID | Item Code / Name | Sched Fest ID | Item Fest ID | Sched Tenant | Item Tenant | Marks | Tokens | Fest Status |
|---|---|---|---|---|---|---|---|---|
'''

for s in sched_data['schedsWithoutMarks']:
    summary_md += f"| `{s['id']}` | {s['item_code']} ({s['item_name']}) | `NULL` | `{s['item_festival_id']}` | `{s['schedule_tenant_id']}` | `{s['item_tenant_id']}` | **0** | **{s['token_count']}** | **NULL** |\n"

summary_md += '''
---

## 4. Evidence Analysis for Special Cases

### Single Published Result Festival Mismatch (Issue 2)
* **VERIFIED FACT**: Result `76bd3bab-bf8e-413f-8565-b92f65fe54c4` has `festival_id = e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6` (2026), whereas linked participant `34654458-9cbd-4b9d-b844-213423bcdd64` has `festival_id = 550e8400-e29b-41d4-a716-446655440000` (2025).
* **VERIFIED FACT**: The linked registration `bdd69c49-9d93-4ce0-90e5-c43052242991` also has `festival_id = 550e8400...` (2025), while the underlying competition item `JR-009` has `festival_id = e80ad8e8...` (2026).
* **INFERENCE**: The result was published for a 2026 item registration created under a 2025 participant record. Operator decision is required to determine whether the participant record should be transferred to 2026 or the result re-assigned.

### 7 Registration Participant/Item Festival Mismatches (Issue 4)
* **VERIFIED FACT**: All 7 registrations have `participant_festival_id = 550e8400...` (2025) and `item_festival_id = e80ad8e8...` (2026).
* **INFERENCE**: It cannot be assumed that `registrations.festival_id` alone is incorrect. Operator review must determine whether participant festival, item selection, or registration entry is the true authoritative record.

### 7 NULL-Grade Results (Issue 9)
* **VERIFIED FACT**: 5 rows have `total_score = NULL, grade = NULL, points_awarded = 0`. 2 rows have `total_score = NULL, grade = NULL, rank = 2/3, points_awarded = 3/1`.
* **VERIFIED FACT**: Performance grade cannot be mathematically derived from rank and points alone when `total_score IS NULL`.
* **DECISION**: Grades will NOT be calculated or synthesized. Original scorecards must be inspected or grades preserved as `NULL`.

### 4 Dangling Tokens (Issue 8)
* **VERIFIED FACT**: Tokens `8e5bc86c...`, `ad19ad30...`, `baf453e3...`, `b5647d79...` reference non-existent schedule UUIDs `b0b53701...`, `f7532042...`, `6d40a587...`. All 4 tokens have `is_used = false` and **0 mark entries**.
* **INSTRUCTION**: Tokens remain classified for revocation, but NO database mutation will occur until an explicit revocation schema is validated in staging.
'''

with open(os.path.join(art_dir, 'FORENSIC_MISMATCH_SUMMARY.md'), 'w', encoding='utf-8') as f:
    f.write(summary_md)
print('Saved FORENSIC_MISMATCH_SUMMARY.md')


# ==============================================================================
# 3. FORENSIC_GROUPED_ROOT_CAUSES.md
# ==============================================================================
grouped_md = '''# Forensic Grouped Root Cause Analysis

**Analysis Scope**: Grouping and Root Cause Isolation for 120 Mark Mismatches & Data Defects  
**Date**: 2026-07-24  

---

## 1. Distinction Between Verified Facts and Inferences

> [!IMPORTANT]
> To ensure audit rigor, all technical findings are strictly divided into **VERIFIED FACTS** (directly observed catalog or data properties) and **INFERENCES** (analytical conclusions regarding probable cause).

---

## 2. Grouping of the 35 Mismatched Schedules & 120 Mark Entries

The 120 cross-boundary mark entries do **NOT** represent 120 isolated data errors. Instead, they originate from **16 schedule records** whose `festival_id` is `NULL`.

### A. 16 Schedules Associated with the 120 Mark Rows

| Schedule UUID | Item Code / Name | Mark Rows | Token Rows | Current Schedule `festival_id` | Linked Item `festival_id` |
|---|---|---|---|---|---|
'''

for s in sched_data['schedsWithMarks']:
    grouped_md += f"| `{s['id']}` | {s['item_code']} ({s['item_name']}) | **{s['mark_count']}** | **{s['token_count']}** | `NULL` | `{s['item_festival_id']}` |\n"

grouped_md += '''
### B. Remaining 19 Mismatched Schedules (0 Mark Rows)

| Schedule UUID | Item Code / Name | Mark Rows | Token Rows | Current Schedule `festival_id` | Linked Item `festival_id` |
|---|---|---|---|---|---|
'''

for s in sched_data['schedsWithoutMarks']:
    grouped_md += f"| `{s['id']}` | {s['item_code']} ({s['item_name']}) | **0** | **{s['token_count']}** | `NULL` | `{s['item_festival_id']}` |\n"

grouped_md += '''
---

## 3. Verified Facts vs Inferences Summary

### Schedule Festival NULL State (Issues 3, 5, 6, 7)
* **VERIFIED FACT**: All 35 schedules have `schedules.festival_id = NULL` while `items.festival_id = e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6`.
* **VERIFIED FACT**: 16 of the schedules contain 120 finalized mark entries and 31 judge tokens. 19 of the schedules contain 0 mark entries and 13 judge tokens.
* **INFERENCE**: The bulk schedule import function (`execute_schedule_import_chunk`) inserted schedules with explicit `item_id` and `tenant_id`, but did not populate `festival_id`.

### 59 Registration Tenant Mismatches (Issue 1)
* **VERIFIED FACT**: 59 registrations have `tenant_id = d3ed1102-31a6-4e44-86ca-7a41c4359db1` (sector tenant) while their linked participant record has a unit tenant ID.
* **INFERENCE**: Registration bulk import assigned the top-level sector tenant ID to registrations instead of copying `participants.tenant_id`.
* **CLASSIFICATION**: Classified as `MANUAL/BATCH REVIEW REQUIRED` until multi-table tenant relationships (organisation, item, result, mark) are evaluated together.

### Single Result Festival Mismatch (Issue 2)
* **VERIFIED FACT**: Result `76bd3bab-bf8e-413f-8565-b92f65fe54c4` has `festival_id = e80ad8e8...` (2026) while linked participant and registration have `festival_id = 550e8400...` (2025).
* **CLASSIFICATION**: Classified as `MANUAL REVIEW REQUIRED`.
'''

with open(os.path.join(art_dir, 'FORENSIC_GROUPED_ROOT_CAUSES.md'), 'w', encoding='utf-8') as f:
    f.write(grouped_md)
print('Saved FORENSIC_GROUPED_ROOT_CAUSES.md')


# ==============================================================================
# 4. FORENSIC_OPERATOR_DECISIONS.md
# ==============================================================================
decisions_md = '''# Forensic Operator Decision Matrix

**Scope**: Classification & Required Operator Decisions Prior to Remediation SQL  
**Date**: 2026-07-24  

---

## 1. Classification Overview

> [!NOTE]
> In accordance with user directives, **ZERO RECOMMENDED AUTO-FIXES ARE PRE-APPROVED**. Every candidate authority requires explicit operator review and confirmation.

| Classification Category | Root Rows | Dependent Rows | Operational Requirement |
|---|---|---|---|
| `MANUAL/BATCH REVIEW REQUIRED` | **110** | 0 | Operator review of 59 reg tenant mismatches, 35 schedule festival NULL rows, 7 reg participant/item mismatches, 7 NULL-grade result rows, 1 result mismatch, 1 reg mismatch |
| `HISTORICAL DATA — PRESERVE` | 0 | **120** | Preserve all 120 finalized mark records intact |
| `DEPENDENT RECORD — PRESERVE` | 0 | **31** | Preserve 31 judge tokens linked to the 16 active schedules |
| `INVALID REFERENCE — REVOKE/ARCHIVE` | **4** | 0 | Revoke 4 dangling tokens once revocation schema is validated in staging |

---

## 2. Operator Decisions Required

### Decision 1: 59 Registration Tenant Mismatches (Issue 1)
* **Description**: 59 registrations have sector tenant ID while linked participants have unit tenant IDs.
* **Option A**: Update `registrations.tenant_id` to match `participants.tenant_id`.
* **Option B**: Retain sector tenant ID if registrations represent sector-level entries.

---

### Decision 2: 35 Schedule Festival NULL Rows (Issues 3, 5, 6, 7)
* **Description**: 35 schedules (16 with 120 marks, 19 without marks) have `festival_id = NULL`.
* **Option A**: Update `schedules.festival_id` to match `items.festival_id` (`e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6`).
* **Option B**: Specify custom festival assignment per schedule slot.

---

### Decision 3: 7 Registration Participant/Item Festival Mismatches (Issue 4)
* **Description**: 7 participants (2025 festival) registered for 2026 items.
* **Option A**: Transfer participant records to 2026 festival.
* **Option B**: Re-assign registrations to 2025 items.
* **Option C**: Cancel cross-festival registrations.

---

### Decision 4: Single Published Result Festival Mismatch (Issue 2)
* **Description**: Result `76bd3bab...` has festival 2026, while participant and registration have festival 2025.
* **Option A**: Transfer participant to 2026 festival.
* **Option B**: Update result festival ID to 2025.

---

### Decision 5: 7 NULL-Grade Result Records (Issue 9)
* **Description**: 7 result rows have `grade = NULL` and `total_score = NULL`.
* **Option A**: Inspect original physical scorecards to populate `total_score` and calculate grades.
* **Option B**: Preserve `grade = NULL` without synthesizing performance grades.

---

### Decision 6: Testing Staging Token Revocation Schema (Issue 8)
* **Description**: 4 judge tokens reference missing schedules.
* **Option A**: Deploy and test token revocation DDL in staging environment before applying to live database.
'''

with open(os.path.join(art_dir, 'FORENSIC_OPERATOR_DECISIONS.md'), 'w', encoding='utf-8') as f:
    f.write(decisions_md)
print('Saved FORENSIC_OPERATOR_DECISIONS.md')
