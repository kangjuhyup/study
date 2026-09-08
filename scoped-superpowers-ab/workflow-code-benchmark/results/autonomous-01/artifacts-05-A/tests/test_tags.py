import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_strips_casefolds_discards_blanks_and_deduplicates_in_order(self):
        tags = [" Python ", "", "PYTHON", " Straße ", "STRASSE", "  Data  "]

        result = normalize_tags(tags)

        self.assertEqual(result, ["python", "strasse", "data"])

    def test_does_not_mutate_input_and_returns_a_new_list(self):
        tags = [" One ", "ONE", "Two"]
        original = tags.copy()

        result = normalize_tags(tags)

        self.assertEqual(tags, original)
        self.assertIsNot(result, tags)

    def test_rejects_non_list_input(self):
        with self.assertRaises(TypeError):
            normalize_tags(("tag",))

    def test_validates_late_non_string_after_blanks_and_duplicates(self):
        with self.assertRaises(TypeError):
            normalize_tags([" ", "tag", "TAG", 3])


if __name__ == "__main__":
    unittest.main()
