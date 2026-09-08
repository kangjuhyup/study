import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_strips_casefolds_discards_blanks_and_deduplicates_in_order(self):
        tags = ["  Python ", "", "PYTHON", " Straße ", "STRASSE", "K", "k"]

        result = normalize_tags(tags)

        self.assertEqual(result, ["python", "strasse", "k"])
        self.assertEqual(
            tags,
            ["  Python ", "", "PYTHON", " Straße ", "STRASSE", "K", "k"],
        )
        self.assertIsNot(result, tags)

    def test_empty_input_returns_a_new_list(self):
        tags = []

        result = normalize_tags(tags)

        self.assertEqual(result, [])
        self.assertIsNot(result, tags)

    def test_rejects_non_list_input(self):
        with self.assertRaisesRegex(TypeError, "tags must be a list"):
            normalize_tags(("python",))

    def test_validates_elements_after_blanks_and_duplicates(self):
        with self.assertRaisesRegex(TypeError, "every tag must be a string"):
            normalize_tags([" ", "Python", "python", 3])


if __name__ == "__main__":
    unittest.main()
