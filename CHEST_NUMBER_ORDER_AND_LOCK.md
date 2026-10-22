# Chest number order and final lock

## Verified implementation

Route: `/participants/chest-numbers`. Team-template festivals display the saved
slot order, including teams without participants. Desktop mouse and mobile touch
dragging preview a different order. Up/down controls also support reordering.
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
| `get_festival_chest_order(uuid)` | Admin-scoped settings, teams, allocated slots and counts; no writes |
| `save_festival_chest_order(uuid,uuid[],uuid[],integer,integer)` | Validate snapshot, replace slots, regenerate, increment revision |
| `set_festival_chest_lock(uuid,boolean,integer,uuid[],integer,text)` | Validate snapshot/code and permission; persist lock and revision |

`festival_team_chest_slots` remains the numbering-order source of truth.
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

Migration: `supabase/migrations/20261022020647_festival_chest_order_and_final_lock.sql`.
It requires the existing team-numbering schema and functions from
`20261020181313_team_chest_number_template.sql`. It creates the private controls
table, three RPCs, authorization helper and database write guards. It does not
renumber existing participants or change the initial team order on installation.

Verified locally:

- `node tests/chest-order-db.cjs`: disposable PostgreSQL 15, actual existing
  allocation/regeneration/transfer triggers; checks ordering, uniqueness,
  rollback on legacy over-capacity, stale snapshots, lock enforcement, correct
  and incorrect codes, tenant/role isolation, retained numbers after unlock,
  valid new participants, category compatibility, preserved General group
  identities/collision rollback and concurrent lock/save.
- `node tests/chest-order-browser.cjs`: fake authenticated session and fully
  intercepted API; desktop drag, touch drag, arrows, explicit Save, persistence,
  lock/unlock, stale-save recovery, empty/error states and 1440/1024/768/390/320px.
- Focused ESLint and Expo web export passed. The export has existing font/CSS
  warnings. Full-project TypeScript still reports unrelated existing errors;
  no errors were reported for the four changed/new application files.

Browser screenshots and the synthetic export are local generated artifacts under
`output/chest-order-validation` and `output/chest-order-web`. Browser mocks do not
prove remote deployment. Publishing this migration to the staging repository's
`main` branch does not apply it to Supabase or deploy the application; run the
migration separately against the intended staging database.
