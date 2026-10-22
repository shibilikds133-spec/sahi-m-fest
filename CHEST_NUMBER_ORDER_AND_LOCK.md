# Chest number order and final lock

## Verified implementation

Route: `/participants/chest-numbers`. Team-template festivals display the saved
slot order for active teams, including teams without participants. Archived
teams are hidden from the list and remain fixed in their saved slots, so their
number ranges stay reserved. Desktop mouse and mobile touch dragging preview a
different order among active teams. Up/down controls also support reordering.
Nothing is persisted until **Save order**. The category-template screen retains
its existing regeneration workflow.

Save sends the original revision, range and ordered team IDs together with the
proposed order. The server checks ownership and rejects stale snapshots, omitted,
duplicate or foreign team IDs. It replaces the existing festival team slots and
calls the existing two-phase chest-number regeneration in one transaction. A
capacity or regeneration error rolls back the order, numbers and revision.

**Final Lock** requires a saved order and valid numbers in each team's range.
The server blocks slot changes, existing participant number/team changes,
regeneration and Calendar template/range changes while locked. Ordinary participant
details can still be edited; new participants in an existing team can receive
unused numbers within that team's range. Allocating a new team's slot requires
unlocking. Deleting the festival retains its existing cascading cleanup behavior.

**Unlock** accepts the festival owner's Tenant ID as the confirmation code.
The server also checks the signed-in admin's role and tenant ownership; knowing a
Tenant ID alone grants no permission. Unlock preserves every existing number and
the saved order. Codes are sent in the RPC body and are not written to audit rows.

## Data and API flow

`Chest Numbers -> useChestNumberOrder -> chestNumberService -> Supabase RPC`

| RPC | Result / effects |
| --- | --- |
| `get_festival_chest_order(uuid)` | Admin-scoped settings, teams, archived-state flags, allocated slots and counts; no writes |
| `save_festival_chest_order(uuid,uuid[],uuid[],integer,integer)` | Validate snapshot, reorder active teams across existing active slots, preserve archived slots, regenerate, increment revision |
| `set_festival_chest_lock(uuid,boolean,integer,uuid[],integer,text)` | Validate snapshot/code and permission; persist lock and revision |

`festival_team_chest_slots` remains the numbering-order source of truth. The
client keeps archived teams in the saved-order snapshot as hidden anchors and
reorders active teams only across active positions. The save RPC independently
maps the submitted active-team order onto existing active slot numbers and
leaves archived slot rows untouched, including gaps left by deleted teams. This
preserves archived teams' slot ranges when active teams are reordered.
`festival_chest_number_controls` stores the festival lock, revision, last actor
and timestamp. RLS is enabled and direct client table access is revoked; the
three admin-checked RPCs provide access. Existing numbering/regeneration audits
are retained. All protected operations use the existing festival numbering
advisory lock. Concurrent saves/locks are serialized; outdated requests fail
instead of overwriting the committed state.

Successful saves invalidate participant and public-candidate queries and reuse
the existing festival-scoped registration-label invalidation helper. Lock responses update the settings cache directly. Save failures
refresh server state while retaining the user's draft and expose a discard/reload
action. There is no new polling or per-team API request.

## Migration and validation

Migrations: `supabase/migrations/20261022020647_festival_chest_order_and_final_lock.sql`
and `supabase/migrations/20261022110000_hide_archived_teams_from_chest_order.sql`.
They require the existing team-numbering schema and functions from
`20261020181313_team_chest_number_template.sql`. The original migration creates
the private controls table, three RPCs, authorization helper and database write
guards. The follow-up adds `archived_at` to the saved-order RPC payload and
changes saves to preserve archived slots. Applying it does not change stored
slots or renumber participants. Apply both migrations to the target database
before relying on the latest client behavior.

Verified locally:

- `node tests/chest-order-db.cjs`: disposable PostgreSQL 15; existing ordering,
  authorization, lock, regeneration and rollback checks passed, along with the
  archived-team snapshot and preserved-slot regression.
- Focused ESLint and Expo web export passed. Export reports existing font/CSS
  and Browserslist data warnings.
- The updated browser regression was not run in this checkout because
  `puppeteer-core` is unavailable. It covers archived-row visibility and keeping
  archived slots fixed while active teams are reordered.

The database test uses a disposable local container. The Expo export and mocked
browser test do not prove remote deployment. Publishing this migration to the
staging repository's `main` branch does not apply it to Supabase or deploy the
application; run the migration separately against the intended staging database.
