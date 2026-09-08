import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_strips_and_casefolds_unicode_tags(self):
        self.assertEqual(normalize_tags(["  Straße  ", "İ"]), ["strasse", "i̇"])

    def test_discards_blanks_and_deduplicates_in_first_occurrence_order(self):
        tags = [" Python ", "", "PYTHON", "Rust", " strasse ", "Straße", "  "]

        self.assertEqual(normalize_tags(tags), ["python", "rust", "strasse"])

    def test_rejects_non_list_input(self):
        with self.assertRaises(TypeError):
            normalize_tags(("python",))

    def test_rejects_non_string_even_after_blank_and_duplicate_values(self):
        with self.assertRaises(TypeError):
            normalize_tags([" ", "Python", "PYTHON", 1])

    def test_returns_new_list_without_mutating_input(self):
        tags = [" Python ", "PYTHON"]

        result = normalize_tags(tags)

        self.assertEqual(tags, [" Python ", "PYTHON"])
        self.assertIsNot(result, tags)


if __name__ == "__main__":
    unittest.main()
