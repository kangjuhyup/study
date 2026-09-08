import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_strips_casefolds_discards_blanks_and_deduplicates_in_order(self):
        tags = ["  Python ", "PYTHON", "", "  ", "Straße", "STRASSE", "Data"]

        self.assertEqual(normalize_tags(tags), ["python", "strasse", "data"])

    def test_returns_a_new_list_without_mutating_input(self):
        tags = [" One ", "ONE", "Two"]
        original = tags.copy()

        result = normalize_tags(tags)

        self.assertEqual(tags, original)
        self.assertIsNot(result, tags)

    def test_rejects_non_list_input(self):
        with self.assertRaises(TypeError):
            normalize_tags(("tag",))

    def test_rejects_non_string_element_after_ignored_values(self):
        with self.assertRaises(TypeError):
            normalize_tags(["", "Tag", "TAG", 42])


if __name__ == "__main__":
    unittest.main()
