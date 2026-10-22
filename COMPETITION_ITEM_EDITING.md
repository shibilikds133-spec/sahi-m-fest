# Competition Item Editing

This document describes the item metadata editor in the admin **Item Activation** page. It covers edits to existing festival-owned items and edits to custom-item drafts before they are saved. Item activation remains a separate workflow.

## What can be edited

For a saved item, an administrator can edit its Malayalam name and category codes. For a group item, the editor also accepts one exact positive member count. The item's participation type is fixed after it has been saved.

The edit action is available only for items whose `tenant_id` matches the current tenant. Shared handbook items are read-only. Individual items are editable. Existing group items are editable only when `group_min_members` and `group_max_members` are both positive and equal; group items with a range or missing size show **Set fixed size first** because the database function accepts an exact count and would otherwise change the stored group-size rule.

Editing a custom-item draft changes only local form state. Its generated item code follows the selected category, and the draft is persisted later through the existing item activation save flow. Editing a saved item does not change its item code, participation type, schedule, or activation state.

## Request and data flow

The saved-item flow is:

1. `src/app/(admin)/settings/items.tsx` opens the editor and submits the item's ID, Malayalam name, category codes, group count (or `null` for individual items), and the item's `updated_at` value.
2. `useUpdateCompetitionItem` in `src/core/hooks/useFestival.ts` requires an active festival and tenant, calls the settings service, and invalidates the active, all-items, and selectable-items queries after success.
3. `src/services/festivalSettingsService.ts` delegates to `src/lib/repositories/festivalRepository.ts`.
4. `src/providers/database/SupabaseDatabaseProvider.ts` calls `public.update_competition_item` through Supabase RPC.
5. The database function validates the request and updates the item row.

The database function is defined in [`supabase/migrations/20261021165207_edit_tenant_competition_metadata.sql`](supabase/migrations/20261021165207_edit_tenant_competition_metadata.sql).

## Authorization and data integrity

The RPC derives the tenant from the requested festival and calls `scoring_private.assert_admin` for that tenant. It then selects the item using all three ownership keys: item ID, festival ID, and tenant ID. The function is `SECURITY DEFINER` with a pinned search path; execution is revoked from `PUBLIC` and `anon`, and granted to `authenticated`. The tenant-admin check remains enforced inside the function.

To avoid overwriting another administrator's newer edit, the caller supplies the `updated_at` value seen when the editor opened. The function compares it with the current row while holding a festival-scoped advisory transaction lock and a row lock. If it differs, the update fails with a reload-and-retry error. On success, the function updates `updated_at`.

Category codes must be a non-empty, one-dimensional array of non-blank unique values. A group item must have a positive member count, which is written to both `group_min_members` and `group_max_members`. An individual item must send no group count. The Malayalam name is trimmed; the English name is updated only when it is empty or still matches the previous Malayalam name.

## Migration and release checks

The frontend depends on the `public.update_competition_item` function from migration `20261021165207_edit_tenant_competition_metadata.sql`. Before releasing the frontend to an environment, verify that this migration has been applied there and that the RPC is present. The migration file being present in Git does not prove that a remote database has applied it. This document does not claim a live database migration status.

No schedule rows or activation records are changed by this RPC. The existing item activation flow continues to handle activation separately.
