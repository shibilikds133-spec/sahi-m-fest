# Participant item list PDF

This is a standalone generator. It does not modify or import into the website.

## Generate

```powershell
python tools/generate_participant_items_pdf.py tools/participant_items_sample.json `
  --tenant-id 24866a90-161d-4e67-91ab-239cd672541c
```

The default output is `output/pdf/participant-items-a4.pdf`.

CSV is also accepted. Use these columns:

```text
name,chestNumber,category,team,items,tenantId
Muhammed Rashid,104,Junior,Blue House,"English Speech|Essay Writing|Quiz",24866a90-161d-4e67-91ab-239cd672541c
```

## Database mapping

For a tenant-scoped export, use the current schema relationships:

- `participants.name` -> `name`
- `participants.chest_number` -> `chestNumber`
- `participants.category_code` -> `category`
- `participants.organisation_id -> organisations.id`, then `organisations.name` -> `team`
- `registrations.participant_id -> participants.id`
- `registrations.item_id -> items.id`, then `items.item_name_en` (or `item_name_ml`) -> `items[]`
- Filter both participants and registrations by `tenant_id = '24866a90-161d-4e67-91ab-239cd672541c'`; also filter by the intended `festival_id` when generating for a particular festival.

The script deliberately accepts already-exported JSON/CSV instead of embedding database credentials.

## Layout guarantees

- A4 portrait with fixed equal-height sections.
- Exactly four participant sections on every full page.
- The last page keeps the same row height for one or two records.
- A section is never split across pages.
- Long item lists use compact typography and columns; impossible overflow fails with a clear error rather than overlapping text.
- The generator auto-detects a Unicode font. On Windows it prefers `Nirmala.ttc`, which supports Malayalam; pass `--font-path` to choose another installed `.ttf`/`.ttc` font.
