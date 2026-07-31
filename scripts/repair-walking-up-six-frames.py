#!/usr/bin/env python3
"""Repair the six-pose rear walking source without component over-splitting."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SKILL_SCRIPTS = Path.home() / ".codex" / "skills" / "openpbl-sprite-maker" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from normalize_frames import normalize_frame_set  # noqa: E402
from official_adapter import extract_action_strip  # noqa: E402
from openpbl_common import resolve_official_skill_dir  # noqa: E402
from process_action import despill_normalized_frames  # noqa: E402


def main() -> None:
    run_dir = PROJECT_ROOT / "output" / "openpbl-sprite-maker" / "banxue-xiaoling-v2"
    action_dir = run_dir / "actions" / "walking_up"
    frames_dir = action_dir / "frames"
    normalized_dir = action_dir / "normalized"
    source = action_dir / "source" / "generated.png"
    reference = run_dir / "canonical" / "canonical-base.png"
    official_dir = resolve_official_skill_dir(None)

    for directory in (frames_dir, normalized_dir):
        shutil.rmtree(directory, ignore_errors=True)

    extract_action_strip(
        source,
        frames_dir,
        action_id="walking_up",
        frame_count=6,
        chroma_key=(255, 0, 255),
        key_threshold=96.0,
        method="stable-slots",
        official_dir=official_dir,
    )
    normalize_frame_set(
        frames_dir,
        reference,
        normalized_dir,
        expected_frames=6,
        official_dir=official_dir,
    )
    despill_normalized_frames(
        normalized_dir,
        action_dir / "chroma-despill.json",
        chroma_key=(255, 0, 255),
        official_dir=official_dir,
    )

    action_path = action_dir / "action.json"
    action = json.loads(action_path.read_text(encoding="utf-8"))
    action["frames"] = 6
    action["duration_ms"] = [125] * 6
    action["status"] = "repair_required"
    action["repair_method"] = "manual-six-slot-extraction"
    action_path.write_text(json.dumps(action, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
