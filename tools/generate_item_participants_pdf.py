#!/usr/bin/env python3
"""Generate an item-wise participant register from participant-items JSON."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 42
MARGIN_TOP = 38
MARGIN_BOTTOM = 38
ROW_HEIGHT = 18


def find_font(explicit: str | None) -> tuple[str, str]:
    candidates = [Path(explicit)] if explicit else []
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
            name = "ItemParticipantUnicodeFont"
            pdfmetrics.registerFont(TTFont(name, str(path)))
            return name, str(path)
    raise FileNotFoundError("No Unicode font found. Pass a font path with --font-path.")


def load_records(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(payload, dict):
        payload = payload.get("participants", payload.get("data", []))
    if not isinstance(payload, list):
        raise ValueError("Input must be a participant JSON array.")
    return payload


def text(record: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = record.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def draw_header(c: canvas.Canvas, font: str, page_number: int) -> None:
    c.setFillColorRGB(0, 0, 0)
    c.setFont(font, 8)
    c.drawRightString(PAGE_WIDTH - MARGIN_X, 20, f"Page {page_number}")


def draw_item_heading(c: canvas.Canvas, item: str, y: float, font: str) -> float:
    c.setStrokeColorRGB(0.25, 0.25, 0.25)
    c.setLineWidth(0.8)
    c.line(MARGIN_X, y + 7, PAGE_WIDTH - MARGIN_X, y + 7)
    c.setFillColorRGB(0, 0, 0)
    c.setFont(font, 11)
    c.drawString(MARGIN_X, y - 7, item)
    return y - 28


def draw_table_header(c: canvas.Canvas, y: float, font: str) -> float:
    x = MARGIN_X
    widths = [78, 200, 82, PAGE_WIDTH - 2 * MARGIN_X - 78 - 200 - 82]
    labels = ["CHEST NO", "PARTICIPANT", "CATEGORY", "ORGANISATION / TEAM"]
    c.setFont(font, 7.5)
    c.setFillColorRGB(0.2, 0.2, 0.2)
    for label, width in zip(labels, widths):
        c.drawString(x + 4, y, label)
        x += width
    c.setStrokeColorRGB(0.65, 0.65, 0.65)
    c.setLineWidth(0.5)
    c.line(MARGIN_X, y - 6, PAGE_WIDTH - MARGIN_X, y - 6)
    return y - 20


def draw_participant_row(c: canvas.Canvas, record: dict[str, Any], y: float, font: str) -> float:
    x = MARGIN_X
    widths = [78, 200, 82, PAGE_WIDTH - 2 * MARGIN_X - 78 - 200 - 82]
    values = [
        text(record, "chestNumber", "chest_number") or "-",
        text(record, "name", "participantName", "participant_name") or "Unnamed",
        text(record, "category", "categoryCode", "category_code") or "-",
        text(record, "team", "organisation", "organisationName", "organisation_name") or "-",
    ]
    c.setFont(font, 8.2)
    c.setFillColorRGB(0, 0, 0)
    for value, width in zip(values, widths):
        # Keep table geometry stable; long values are clipped to the column width.
        display = value
        while len(display) > 1 and pdfmetrics.stringWidth(display, font, 8.2) > width - 8:
            display = display[:-2] + "..."
        c.drawString(x + 4, y, display)
        x += width
    c.setStrokeColorRGB(0.86, 0.86, 0.86)
    c.setLineWidth(0.35)
    c.line(MARGIN_X, y - 6, PAGE_WIDTH - MARGIN_X, y - 6)
    return y - ROW_HEIGHT


def generate(records: list[dict[str, Any]], output: Path, font_path: str | None) -> str:
    font, selected_font = find_font(font_path)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        for item in record.get("items", []) or []:
            item_name = str(item).strip()
            if item_name and record not in grouped[item_name]:
                grouped[item_name].append(record)
    if not grouped:
        raise ValueError("No assigned items found in the input.")

    output.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    c.setTitle("Item-wise Participant Register")
    c.setAuthor("Standalone item participant PDF generator")
    page_number = 1
    y = PAGE_HEIGHT - MARGIN_TOP

    for item in sorted(grouped, key=str.casefold):
        needed = 28 + 20 + ROW_HEIGHT * len(grouped[item]) + 12
        if y < MARGIN_BOTTOM + needed:
            draw_header(c, font, page_number)
            c.showPage()
            page_number += 1
            y = PAGE_HEIGHT - MARGIN_TOP
        y = draw_item_heading(c, item, y, font)
        y = draw_table_header(c, y, font)
        for record in sorted(grouped[item], key=lambda row: (text(row, "chestNumber", "chest_number"), text(row, "name").casefold())):
            if y < MARGIN_BOTTOM + ROW_HEIGHT:
                draw_header(c, font, page_number)
                c.showPage()
                page_number += 1
                y = PAGE_HEIGHT - MARGIN_TOP
                y = draw_item_heading(c, item + " (continued)", y, font)
                y = draw_table_header(c, y, font)
            y = draw_participant_row(c, record, y, font)
        y -= 14

    draw_header(c, font, page_number)
    c.showPage()
    c.save()
    return selected_font


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an item-wise participant register PDF.")
    parser.add_argument("input", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=Path("output/pdf/item-participants-a4.pdf"))
    parser.add_argument("--font-path")
    args = parser.parse_args()
    records = load_records(args.input)
    font = generate(records, args.output, args.font_path)
    print(f"Generated: {args.output.resolve()}")
    print(f"Items: {len({str(item).strip() for row in records for item in (row.get('items', []) or []) if str(item).strip()})}")
    print(f"Unicode font: {font}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
