from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


SCRIPT_PATH = Path(__file__).with_name("register-body-core.py")
SPEC = importlib.util.spec_from_file_location("register_body_core", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BodyCoreRegistrationTests(unittest.TestCase):
    def make_frame(self, path: Path, body_center: int, arm_left: int) -> None:
        image = Image.new("RGBA", (192, 208), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.ellipse((body_center - 42, 35, body_center + 42, 192), fill=(45, 56, 70, 255))
        draw.rectangle((body_center - 48, 104, body_center + 48, 130), fill=(46, 107, 203, 255))
        draw.rectangle((arm_left, 122, body_center - 36, 142), fill=(45, 56, 70, 255))
        image.save(path)

    def test_aligns_body_core_without_following_an_extended_arm(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "00.png"
            second = root / "01.png"
            self.make_frame(first, body_center=92, arm_left=34)
            self.make_frame(second, body_center=108, arm_left=20)

            report = MODULE.register_frame_set(
                [first, second],
                (46, 107, 203),
                maximum_shift=24,
            )

            self.assertEqual(report["offsets_x"], [8, -8])
            self.assertEqual(report["anchors_after"], [100.0, 100.0])

    def test_rejects_a_shift_that_would_crop_visible_pixels(self) -> None:
        image = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle((1, 8, 20, 24), fill=(46, 107, 203, 255))
        with self.assertRaisesRegex(ValueError, "crop"):
            MODULE.translate_without_crop(image, -2)


if __name__ == "__main__":
    unittest.main()
