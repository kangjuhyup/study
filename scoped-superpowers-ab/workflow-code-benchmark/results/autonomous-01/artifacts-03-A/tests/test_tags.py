import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_strips_casefolds_and_discards_blanks(self):
        self.assertEqual(
            normalize_tags(["  Python ", "\t", "Straße", "Σίσυφος"]),
            ["python", "strasse", "σίσυφοσ"],
        )

    def test_deduplicates_normalized_tags_in_first_occurrence_order(self):
        self.assertEqual(
            normalize_tags([" Beta ", "ALPHA", "beta", "alpha", "Gamma"]),
            ["beta", "alpha", "gamma"],
        )

    def test_casefold_equivalent_unicode_tags_are_duplicates(self):
        self.assertEqual(
            normalize_tags(["Straße", "STRASSE", " strasse "]),
            ["strasse"],
        )

    def test_does_not_mutate_input(self):
        tags = [" Python ", "PYTHON", ""]
        original = tags.copy()

        result = normalize_tags(tags)

        self.assertEqual(tags, original)
        self.assertIsNot(result, tags)

    def test_rejects_non_list_input(self):
        with self.assertRaises(TypeError):
            normalize_tags(("python",))

    def test_validates_non_string_after_blank_and_duplicate(self):
        with self.assertRaises(TypeError):
            normalize_tags([" ", "Python", "python", 1])


if __name__ == "__main__":
    unittest.main()
