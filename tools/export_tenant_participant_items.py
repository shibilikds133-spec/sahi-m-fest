#!/usr/bin/env python3
"""Read-only Supabase exporter for the standalone participant-items PDF tool."""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path


def get_json(base_url: str, service_key: str, table: str, params: dict[str, str]):
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/rest/v1/{table}?{query}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Export one tenant's participant item lists from Supabase.")
    parser.add_argument("tenant_id", nargs="?")
    parser.add_argument("-o", "--output", type=Path, default=Path("output/pdf/tenant-participant-items.json"))
    parser.add_argument("--festival-id", help="Optional festival UUID to scope the export")
    parser.add_argument("--all-participants", action="store_true", help="Export all participants in the selected festival")
    args = parser.parse_args()

    base_url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        raise SystemExit("Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this exporter.")

    if not args.tenant_id and not args.festival_id:
        raise SystemExit("Provide a tenant UUID, or use --festival-id for a festival-wide export.")

    participant_params = {
        "select": "id,name,chest_number,category_code,organisation_id,festival_id,status",
        "status": "neq.rejected",
        "limit": "10000",
        "order": "name.asc",
    }
    if args.tenant_id and not args.all_participants:
        participant_params["tenant_id"] = f"eq.{args.tenant_id}"
    registration_params = {
        "select": "participant_id,item_id,organisation_id,festival_id,status",
        "status": "neq.rejected",
        "limit": "10000",
    }
    item_params = {
        "select": "id,item_name_en,item_name_ml,item_code,festival_id",
        "limit": "10000",
    }
    organisation_params = {
        "select": "id,name",
        "limit": "10000",
    }
    if args.tenant_id and not args.all_participants:
        organisation_params["tenant_id"] = f"eq.{args.tenant_id}"
    participants = get_json(base_url, service_key, "participants", participant_params)
    registrations = get_json(base_url, service_key, "registrations", registration_params)
    items = get_json(base_url, service_key, "items", item_params)
    organisations = get_json(base_url, service_key, "organisations", organisation_params)

    if args.festival_id:
        participants = [row for row in participants if row.get("festival_id") == args.festival_id]
        registrations = [row for row in registrations if row.get("festival_id") == args.festival_id]
        items = [row for row in items if row.get("festival_id") in (None, args.festival_id)]

    participant_ids = {row["id"] for row in participants}
    item_map = {row["id"]: row for row in items}
    organisation_map = {row["id"]: row.get("name", "") for row in organisations}
    item_lists: dict[str, list[str]] = defaultdict(list)
    registration_orgs: dict[str, str] = {}
    for registration in registrations:
        participant_id = registration.get("participant_id")
        item = item_map.get(registration.get("item_id"))
        if participant_id not in participant_ids or not item:
            continue
        display_name = item.get("item_name_en") or item.get("item_name_ml") or item.get("item_code")
        if display_name and display_name not in item_lists[participant_id]:
            item_lists[participant_id].append(display_name)
        if registration.get("organisation_id"):
            registration_orgs[participant_id] = registration["organisation_id"]

    output = []
    for participant in participants:
        organisation_id = participant.get("organisation_id") or registration_orgs.get(participant["id"])
        output.append(
            {
                "tenantId": args.tenant_id,
                "festivalId": participant.get("festival_id"),
                "name": participant.get("name") or "Unnamed participant",
                "chestNumber": participant.get("chest_number"),
                "category": participant.get("category_code"),
                "team": organisation_map.get(organisation_id, "") if organisation_id else "",
                "items": item_lists.get(participant["id"], []),
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(output)} participants to {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
