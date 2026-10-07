"""Non-mutating regression checks: python test_ux_amounts.py."""
import os
import unittest

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
import django
django.setup()
from core.views import _bid_whole


class BidAmounts(unittest.TestCase):
    def test_whole_amounts_are_kept(self):
        for value in (1250, "1250", 1250.0, "1250.00"):
            with self.subTest(value=value):
                self.assertEqual(_bid_whole(value), 1250)

    def test_invalid_amounts_are_never_truncated_or_reinterpreted(self):
        for value in (1250.75, "1250.75", -1250, "-1250", 0, None, True,
                      "Infinity", "NaN", "1,250", "9007199254740992"):
            with self.subTest(value=value):
                self.assertEqual(_bid_whole(value), 0)


if __name__ == "__main__":
    unittest.main()
