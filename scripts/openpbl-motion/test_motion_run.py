from __future__ import annotations

import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = PROJECT_ROOT / "config" / "openpbl-agent-actions.json"
PREPARE_PATH = Path(__file__).with_name("prepare-run.py")
PROCESS_PATH = Path(__file__).with_name("process-action.py")
QA_RUN_PATH = Path(__file__).with_name("qa-run.py")


class MotionRunContractTest(unittest.TestCase):
    def test_catalog_contains_the_approved_c_plan(self) -> None:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        actions = {action["id"]: action for action in catalog["actions"]}
        expected = {
            "walking_horizontal",
            "walking_up",
            "walking_down",
            "turn_arrive",
            "computer_typing_left",
            "computer_browsing_left",
            "computer_thinking_left",
            "screen_pointing",
            "raising_hand",
            "board_listening",
            "comparing_materials",
            "looking_around",
            "slacking",
            "stretching",
            "napping",
            "waking_up",
        }
        self.assertEqual(set(actions), expected)
        for action in actions.values():
            self.assertGreaterEqual(action["frames"], 3)
            self.assertLessEqual(action["frames"], 8)
            self.assertEqual(len(action["duration_ms"]), action["frames"])

    def test_thin_adapters_exist_without_copying_the_installed_skill(self) -> None:
        self.assertTrue(PREPARE_PATH.is_file())
        self.assertTrue(PROCESS_PATH.is_file())
        self.assertTrue(QA_RUN_PATH.is_file())
        self.assertIn("CATALOG_PATH", PREPARE_PATH.read_text(encoding="utf-8"))
        self.assertIn("CATALOG_PATH", PROCESS_PATH.read_text(encoding="utf-8"))
        self.assertIn("CATALOG_PATH", QA_RUN_PATH.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
