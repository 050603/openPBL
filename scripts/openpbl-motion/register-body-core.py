#!/usr/bin/env python3
"""Re-register normalized action frames around the stable scarf/torso junction."""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from pathlib import Path
from typing import Any

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = PROJECT_ROOT / "config" / "openpbl-agent-actions.json"
SKILL_DIR = Path(
    os.environ.get(
        "OPENPBL_SPRITE_MAKER_SKILL",
        str(Path.home() / ".codex" / "skills" / "openpbl-sprite-maker"),
    )
).expanduser().resolve()
SKILL_SCRIPTS = SKILL_DIR / "scripts"

if not (SKILL_SCRIPTS / "process_action.py").is_file():
    raise SystemExit(
        "OpenPBL Sprite Maker was not found. Set OPENPBL_SPRITE_MAKER_SKILL "
        f"to the installed skill directory. Checked: {SKILL_DIR}"
    )

sys.path.insert(0, str(SKILL_SCRIPTS))

import openpbl_common  # noqa: E402

openpbl_common.CATALOG_PATH = CATALOG_PATH

from create_contact_sheet import make_action_contact_sheet  # noqa: E402
from official_adapter import save_gif_and_webp  # noqa: E402
from process_action import write_action_manifest  # noqa: E402
from qa_action import deterministic_qa, parse_hex  # noqa: E402


def scarf_root_anchor(
    image: Image.Image,
    master_color: tuple[int, int, int],
    *,
    tolerance: int = 60,
    upper_fraction: float = 0.42,
) -> float:
    """Return the robust x center of the scarf's upper wrap, excluding its tail."""

    rgba = image.convert("RGBA")
    matching: list[tuple[int, int]] = []
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = rgba.getpixel((x, y))
            if alpha < 128:
                continue
            if max(
                abs(red - master_color[0]),
                abs(green - master_color[1]),
                abs(blue - master_color[2]),
            ) <= tolerance:
                matching.append((x, y))

    if len(matching) < 64:
        raise ValueError("not enough scarf-colored pixels to register the body core")

    # Ignore isolated blue pixels from the face light, belly badge, or
    # anti-aliased edges. A raw min/max lets one outlier pull the upper scarf
    # band away from the actual neck wrap.
    sorted_y = sorted(y for _, y in matching)
    minimum_y = sorted_y[int((len(sorted_y) - 1) * 0.02)]
    maximum_y = sorted_y[int((len(sorted_y) - 1) * 0.98)]
    upper_limit = minimum_y + (maximum_y - minimum_y) * upper_fraction
    upper_x = [x for x, y in matching if y <= upper_limit]
    if len(upper_x) < 32:
        raise ValueError("not enough upper-scarf pixels to register the body core")
    return float(statistics.median(upper_x))


def translate_without_crop(image: Image.Image, offset_x: int) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha_bounds = rgba.getchannel("A").getbbox()
    if alpha_bounds is None or offset_x == 0:
        return rgba
    if alpha_bounds[0] + offset_x < 0 or alpha_bounds[2] + offset_x > rgba.width:
        raise ValueError(
            f"body-core shift {offset_x}px would crop visible pixels from bounds {alpha_bounds}"
        )

    translated = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    translated.alpha_composite(rgba, (offset_x, 0))
    return translated


def register_frame_set(
    frame_paths: list[Path],
    master_color: tuple[int, int, int],
    *,
    tolerance: int = 60,
    maximum_shift: int = 24,
    safe_margin: int = 8,
) -> dict[str, Any]:
    if not frame_paths:
        raise ValueError("no normalized frames found")

    anchors: list[float] = []
    bounds: list[tuple[int, int, int, int]] = []
    frame_width = 0
    for path in frame_paths:
        with Image.open(path) as opened:
            frame_width = opened.width
            anchors.append(
                scarf_root_anchor(opened, master_color, tolerance=tolerance)
            )
            alpha_bounds = opened.convert("RGBA").getchannel("A").getbbox()
            if alpha_bounds is None:
                raise ValueError(f"normalized frame is fully transparent: {path}")
            bounds.append(alpha_bounds)

    preferred_target = int(round(statistics.median(anchors)))
    minimum_target = max(
        int(round(anchor + safe_margin - bounds[index][0]))
        for index, anchor in enumerate(anchors)
    )
    maximum_target = min(
        int(round(anchor + frame_width - safe_margin - bounds[index][2]))
        for index, anchor in enumerate(anchors)
    )
    if minimum_target > maximum_target:
        raise ValueError(
            "body-core registration cannot satisfy the safe canvas margin "
            f"{safe_margin}px: target range {minimum_target}..{maximum_target}"
        )
    target_x = min(max(preferred_target, minimum_target), maximum_target)
    offsets = [int(round(target_x - anchor)) for anchor in anchors]
    if any(abs(offset) > maximum_shift for offset in offsets):
        raise ValueError(
            f"required body-core shift exceeds {maximum_shift}px: {offsets}"
        )

    for path, offset in zip(frame_paths, offsets, strict=True):
        if offset == 0:
            continue
        with Image.open(path) as opened:
            translated = translate_without_crop(opened, offset)
        translated.save(path)

    verified_anchors: list[float] = []
    for path in frame_paths:
        with Image.open(path) as opened:
            verified_anchors.append(
                scarf_root_anchor(opened, master_color, tolerance=tolerance)
            )

    return {
        "schema_version": 1,
        "algorithm": "upper-scarf-median-x body-core registration",
        "target_x": target_x,
        "anchors_before": anchors,
        "offsets_x": offsets,
        "anchors_after": verified_anchors,
        "maximum_shift": maximum_shift,
        "safe_margin": safe_margin,
        "safe_target_range": [minimum_target, maximum_target],
        "tolerance": tolerance,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--action", required=True)
    parser.add_argument("--tolerance", type=int, default=60)
    parser.add_argument("--maximum-shift", type=int, default=24)
    parser.add_argument("--official-skill-dir", default="")
    args = parser.parse_args()

    run_dir = Path(args.run_dir).expanduser().resolve()
    run = openpbl_common.load_run(run_dir)
    catalog = openpbl_common.load_catalog()
    action = openpbl_common.action_by_id(catalog, args.action)
    task = next(item for item in run["actions"] if item["id"] == args.action)
    action_dir = run_dir / "actions" / args.action
    normalized_dir = action_dir / "normalized"
    frame_paths = openpbl_common.frame_files(normalized_dir)
    expected_frames = int(action["frames"])
    if len(frame_paths) != expected_frames:
        raise SystemExit(
            f"{args.action} has {len(frame_paths)} normalized frames; expected {expected_frames}"
        )

    official_dir = openpbl_common.resolve_official_skill_dir(
        args.official_skill_dir or run.get("official_skill_dir")
    )
    master_color = parse_hex(run.get("scarf", {}).get("master_color", "#2E6BCB"))
    openpbl_common.set_status(
        run_dir,
        run,
        args.action,
        "processing",
        note="re-registering normalized frames around the scarf/torso body core",
    )

    report = register_frame_set(
        frame_paths,
        master_color,
        tolerance=args.tolerance,
        maximum_shift=args.maximum_shift,
    )
    report_path = action_dir / "body-core-registration.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    openpbl_common.record_step(
        task,
        "body_core_registration",
        "complete",
        report=openpbl_common.rel_path(report_path, run_dir),
        target_x=report["target_x"],
        offsets_x=report["offsets_x"],
    )

    qa = deterministic_qa(run_dir, args.action, official_dir=official_dir)
    task["qa"] = qa
    task["qa_path"] = openpbl_common.rel_path(action_dir / "qa.json", run_dir)
    if not qa["ok"]:
        openpbl_common.record_step(task, "frame_qa", "failed", errors=qa["errors"])
        openpbl_common.set_status(
            run_dir,
            run,
            args.action,
            "repair_required",
            note="body-core registration failed deterministic QA",
            error="; ".join(qa["errors"]),
        )
        raise SystemExit(
            f"{args.action} body-core registration failed QA; inspect {action_dir / 'qa.json'}"
        )

    preview = save_gif_and_webp(
        normalized_dir,
        [int(value) for value in action["duration_ms"]],
        action_dir / "preview.gif",
        action_dir / "preview.webp",
        official_dir=official_dir,
    )
    contact = make_action_contact_sheet(run_dir, args.action)
    task["preview"] = preview
    task["contact_sheet"] = contact
    task["visual_verdict"] = {"status": "pending_independent_review"}
    openpbl_common.record_step(task, "frame_qa", "complete", warnings=qa["warnings"])
    openpbl_common.record_step(task, "preview", "complete", **preview)
    openpbl_common.record_step(task, "contact_sheet", "complete", **contact)
    openpbl_common.set_status(
        run_dir,
        run,
        args.action,
        "qa",
        note="body-core registration passed deterministic QA; independent review required",
    )
    write_action_manifest(run_dir, task)
    openpbl_common.save_run(run_dir, run)
    print(
        json.dumps(
            {
                "ok": True,
                "action": args.action,
                "status": "qa",
                "registration": report,
                "qa": {
                    "ok": qa["ok"],
                    "baseline_spread": qa["baseline_spread"],
                    "height_spread": qa["height_spread"],
                    "warnings": qa["warnings"],
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
