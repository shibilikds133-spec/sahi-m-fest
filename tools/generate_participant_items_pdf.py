#!/usr/bin/env python3
"""Generate a print-ready A4 participant item list.

Input may be a JSON array, {"participants": [...]} JSON object, or CSV.
The generator is intentionally standalone and never connects to Supabase.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 46
MARGIN_TOP = 34
MARGIN_BOTTOM = 34
ROWS_PER_PAGE = 4
ROW_HEIGHT = (PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) / ROWS_PER_PAGE
PADDING_X = 15
PADDING_TOP = 16
PADDING_BOTTOM = 12


def find_font(explicit: str | None) -> tuple[str, str]:
    """Return a Unicode-capable font path and a stable ReportLab name."""
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    candidates.extend(
        [
            Path(r"C:\Windows\Fonts\Nirmala.ttc"),
            Path(r"C:\Windows\Fonts\Nirmala.ttf"),
            Path(r"C:\Windows\Fonts\arial.ttf"),
            Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ]
    )
    for path in candidates:
        if path.exists():
            name = "ParticipantUnicodeFont"
            pdfmetrics.registerFont(TTFont(name, str(path)))
            return name, str(path)
    raise FileNotFoundError(
        "No Unicode font found. Pass a .ttf/.ttc path with --font-path."
    )


def value(record: dict[str, Any], *keys: str) -> str:
    for key in keys:
        raw = record.get(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    return ""


def items_from_value(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    return [item.strip() for item in str(raw).split("|") if item.strip()]


def load_records(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            return list(csv.DictReader(stream))

    with path.open("r", encoding="utf-8-sig") as stream:
        payload = json.load(stream)
    if isinstance(payload, dict):
        payload = payload.get("participants", payload.get("data", []))
    if not isinstance(payload, list) or not all(isinstance(row, dict) for row in payload):
        raise ValueError("Input must be a JSON array or an object with a participants array.")
    return payload


def normalize_records(records: Iterable[dict[str, Any]], tenant_id: str | None) -> list[dict[str, Any]]:
    normalized = []
    for record in records:
        record_tenant = value(record, "tenantId", "tenant_id")
        if tenant_id and record_tenant and record_tenant != tenant_id:
            continue
        normalized.append(
            {
                "name": value(record, "name", "participantName", "participant_name") or "Unnamed participant",
                "chestNumber": value(record, "chestNumber", "chest_number"),
                "category": value(record, "category", "categoryCode", "category_code"),
                "team": value(record, "team", "organisation", "organisationName", "organisation_name"),
                "items": items_from_value(record.get("items", record.get("competitionItems", record.get("competition_items")))),
            }
        )
    return normalized


def wrap_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines or [text]


def estimate_item_lines(items: list[str], font: str, size: float, width: float, columns: int) -> int:
    column_width = (width - 18 * (columns - 1)) / columns
    return sum(len(wrap_text(f"- {item}", font, size, column_width)) for item in items)


def draw_bold_text(c: canvas.Canvas, x: float, y: float, text: str, font: str, size: float) -> None:
    # A small offset gives a dependable faux-bold effect even when the selected
    # Unicode font has no separate bold face.
    c.setFont(font, size)
    c.drawString(x, y, text)
    c.drawString(x + 0.25, y, text)


def draw_items(c: canvas.Canvas, items: list[str], x: float, y: float, width: float, height: float, font: str) -> None:
    if not items:
        c.setFont(font, 8.5)
        c.drawString(x, y, "- None recorded")
        return

    selected = None
    for columns in (1, 2, 3, 4):
        column_width = (width - 18 * (columns - 1)) / columns
        for item_size, leading in ((9.0, 11.0), (8.2, 10.0), (7.5, 9.0), (7.0, 8.2), (6.4, 7.5), (6.0, 7.0)):
            column_lines = [[] for _ in range(columns)]
            line_counts = [0] * columns
            for item in items:
                lines = wrap_text(f"- {item}", font, item_size, column_width)
                target = min(range(columns), key=lambda index: line_counts[index])
                column_lines[target].extend(lines)
                line_counts[target] += len(lines)
            max_lines = max(line_counts, default=0)
            if max_lines * leading <= height:
                selected = (columns, column_width, item_size, leading, column_lines)
                break
        if selected:
            break

    if not selected:
        raise ValueError("A participant has too many/long items to fit one fixed participant section.")

    columns, column_width, item_size, leading, column_lines = selected

    for column, lines in enumerate(column_lines):
        line_y = y
        line_x = x + column * (column_width + 18)
        c.setFont(font, item_size)
        for line in lines:
            if line_y < y - height:
                raise ValueError("Item list overflowed its participant section.")
            c.drawString(line_x, line_y, line)
            line_y -= leading


def draw_participant(c: canvas.Canvas, participant: dict[str, Any], row_index: int, font: str) -> None:
    top = PAGE_HEIGHT - MARGIN_TOP - row_index * ROW_HEIGHT
    bottom = top - ROW_HEIGHT
    x = MARGIN_X + PADDING_X
    width = PAGE_WIDTH - 2 * (MARGIN_X + PADDING_X)

    name = participant["name"]
    name_size = 15 if len(name) <= 28 else 12.5
    draw_bold_text(c, x, top - PADDING_TOP - name_size, name, font, name_size)

    fields = []
    if participant["chestNumber"]:
        fields.append(f"Chest No: {participant['chestNumber']}")
    if participant["category"]:
        fields.append(f"Category: {participant['category']}")
    if participant["team"]:
        fields.append(f"Organisation / Team: {participant['team']}")

    field_y = top - PADDING_TOP - name_size - 17
    c.setFont(font, 8.5)
    for field in fields:
        for line in wrap_text(field, font, 8.5, width):
            c.drawString(x, field_y, line)
            field_y -= 11

    items_label_y = field_y - 5
    c.setFont(font, 9)
    c.drawString(x, items_label_y, "Items:")
    draw_items(c, participant["items"], x + 3, items_label_y - 15, width - 3, max(20, items_label_y - bottom - PADDING_BOTTOM - 15), font)

    if row_index < 2:
        c.setStrokeColorRGB(0.78, 0.78, 0.78)
        c.setLineWidth(0.55)
        c.line(MARGIN_X, bottom, PAGE_WIDTH - MARGIN_X, bottom)


def generate(records: list[dict[str, Any]], output: Path, font_path: str | None) -> str:
    font, selected_font_path = find_font(font_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    c.setTitle("Participant Competition Items")
    c.setAuthor("Standalone participant item list generator")

    for index, participant in enumerate(records):
        row = index % ROWS_PER_PAGE
        if row == 0:
            c.setFillColorRGB(0, 0, 0)
        draw_participant(c, participant, row, font)
        if row == ROWS_PER_PAGE - 1 or index == len(records) - 1:
            c.showPage()
    if not records:
        c.showPage()
    c.save()
    return selected_font_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an A4 portrait participant item list PDF.")
    parser.add_argument("input", type=Path, help="JSON or CSV input file")
    parser.add_argument("-o", "--output", type=Path, default=Path("output/pdf/participant-items-a4.pdf"))
    parser.add_argument("--tenant-id", help="Filter records containing tenantId/tenant_id")
    parser.add_argument("--font-path", help="Optional Unicode .ttf/.ttc font path")
    args = parser.parse_args()

    try:
        records = normalize_records(load_records(args.input), args.tenant_id)
        font_path = generate(records, args.output, args.font_path)
    except Exception as exc:  # provide a concise CLI error without a traceback
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Generated: {args.output.resolve()}")
    print(f"Participants: {len(records)}")
    print(f"Pages: {(len(records) + ROWS_PER_PAGE - 1) // ROWS_PER_PAGE if records else 1}")
    print(f"Unicode font: {font_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
