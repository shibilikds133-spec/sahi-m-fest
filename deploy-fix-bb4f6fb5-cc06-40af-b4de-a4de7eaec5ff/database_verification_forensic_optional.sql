-- ============================================================================
-- DATABASE VERIFICATION SCRIPT — FORENSIC & CODE DEFINITION QUERIES (OPTIONAL)
-- ============================================================================
-- Target Repository: Festival Management Platform (`web-for-sahi--main`)
-- Purpose: Provide optional forensic queries for raw migration statements, full
--          function definitions, view definitions, and persistent record key triples.
--
-- Read-Only Safety Statement:
--   Read-only by design and statically reviewed for non-mutating statements.
--   Contains ONLY SELECT statements. Zero INSERT, UPDATE, DELETE, ALTER, DROP.
--
-- ============================================================================
-- PRIVACY AND SENSITIVE DATA WARNING:
-- This file outputs raw migration SQL statements, full PostgreSQL function
-- definitions, view definitions, and persistent record key triples.
--
-- Outputs from this script MAY CONTAIN:
--   - Legacy DDL/DML seed data
--   - Initial test credentials or hard-coded passwords
--   - Internal webhook URLs or private RPC business logic
--   - Persistent database record identifiers
--
-- REVIEW AND REDACT OUTPUT BEFORE SHARING PUBLICLY OR ATTACHING TO TICKETS.
-- ============================================================================


-- ============================================================================
-- SECTION 1: RAW MIGRATION SQL STATEMENTS DUMP
-- ============================================================================
-- PREREQUISITE: Run only if supabase_migrations.schema_migrations exists.
-- WARNING: May contain legacy seed data or test credentials.

SELECT 'FORENSIC 1.1 Raw Migration Statements Dump' AS section;
SELECT
  version,
  name,
  statements
FROM supabase_migrations.schema_migrations
ORDER BY version;


-- ============================================================================
-- SECTION 2: FULL FUNCTION SOURCE CODE DEFINITIONS
-- ============================================================================
-- PREREQUISITE: Can be run on any PostgreSQL database with pg_proc access.
-- WARNING: May contain private RPC business logic or internal URL paths.

SELECT 'FORENSIC 2.1 All Public Functions (Full Definition)' AS section;
SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname;


-- ============================================================================
-- SECTION 3: FULL VIEW DEFINITIONS
-- ============================================================================
-- PREREQUISITE: Can be run on any PostgreSQL database with pg_views access.
-- WARNING: May contain view queries exposing internal schema structures.

SELECT 'FORENSIC 3.1 All Views (Full Definition)' AS section;
SELECT
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;


-- ============================================================================
-- SECTION 4: DETAILED DUPLICATE MARK ENTRY RECORD KEY TRIPLES
-- ============================================================================
-- PREREQUISITE: Run only if mark_entries table exists.
-- WARNING: Outputs persistent record key identifiers for diagnostic remediation.

SELECT 'FORENSIC 4.1 Detailed Duplicate Mark Entry Key Triples (Top 50)' AS section;
SELECT
  judge_id,
  schedule_id,
  registration_id,
  COUNT(*)::bigint AS duplicate_count
FROM public.mark_entries
GROUP BY judge_id, schedule_id, registration_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 50;
