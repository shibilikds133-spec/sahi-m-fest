#!/usr/bin/env python3
"""Generate the item-wise participant PDF directly from the configured Supabase project."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORTER = ROOT / "tools" / "export_tenant_participant_items.py"
GENERATOR = ROOT / "tools" / "generate_item_participants_pdf.py"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def main() -> int:
    parser = argparse.ArgumentParser(description="Read current participant/item data and generate an item-wise PDF.")
    parser.add_argument("--festival-id", required=True, help="Festival UUID to export")
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all-tenants", action="store_true", help="Include every tenant in the festival")
    scope.add_argument("--tenant-id", help="Limit the export to one tenant")
    parser.add_argument("-o", "--output", type=Path, default=Path("output/pdf/item-participants-a4-from-system.pdf"))
    args = parser.parse_args()

    load_env_file(ROOT / ".env.local")
    load_env_file(ROOT / ".env")
    if not os.environ.get("EXPO_PUBLIC_SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise SystemExit("Supabase URL/service key not found in environment or .env files.")

    export_json = args.output.with_suffix(".json")
    export_command = [sys.executable, str(EXPORTER), "--festival-id", args.festival_id, "-o", str(export_json)]
    if args.all_tenants:
        export_command.append("--all-participants")
    else:
        export_command.insert(2, args.tenant_id)
    subprocess.run(export_command, cwd=ROOT, check=True)

    subprocess.run(
        [sys.executable, str(GENERATOR), str(export_json), "-o", str(args.output)],
        cwd=ROOT,
        check=True,
    )
    print(f"System-data PDF ready: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
