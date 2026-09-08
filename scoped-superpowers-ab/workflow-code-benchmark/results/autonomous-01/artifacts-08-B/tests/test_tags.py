import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_uses_unicode_casefold(self):
        self.assertEqual(normalize_tags([" Straße "]), ["strasse"])

    def test_removes_duplicates_in_first_occurrence_order(self):
        self.assertEqual(
            normalize_tags([" Beta ", "ALPHA", "beta", "alpha", "Gamma"]),
            ["beta", "alpha", "gamma"],
        )

    def test_discards_blanks_without_mutating_input(self):
        tags = ["  ", " Keep ", "\t"]

        self.assertEqual(normalize_tags(tags), ["keep"])
        self.assertEqual(tags, ["  ", " Keep ", "\t"])

    def test_rejects_non_list_input(self):
        with self.assertRaises(TypeError):
            normalize_tags(("tag",))

    def test_validates_elements_after_blanks_and_duplicates(self):
        with self.assertRaises(TypeError):
            normalize_tags([" ", "tag", "TAG", 3])


if __name__ == "__main__":
    unittest.main()
