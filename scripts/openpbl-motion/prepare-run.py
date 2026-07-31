#!/usr/bin/env python3
"""Prepare a project-local C-plan run through the installed sprite-maker."""

from __future__ import annotations

import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = PROJECT_ROOT / "config" / "openpbl-agent-actions.json"
SKILL_DIR = Path(
    os.environ.get(
        "OPENPBL_SPRITE_MAKER_SKILL",
        str(Path.home() / ".codex" / "skills" / "openpbl-sprite-maker"),
    )
).expanduser().resolve()
SKILL_SCRIPTS = SKILL_DIR / "scripts"

if not (SKILL_SCRIPTS / "prepare_run.py").is_file():
    raise SystemExit(
        "OpenPBL Sprite Maker was not found. Set OPENPBL_SPRITE_MAKER_SKILL "
        f"to the installed skill directory. Checked: {SKILL_DIR}"
    )

sys.path.insert(0, str(SKILL_SCRIPTS))

import openpbl_common  # noqa: E402

openpbl_common.CATALOG_PATH = CATALOG_PATH

import prepare_run  # noqa: E402


if __name__ == "__main__":
    prepare_run.main()
