import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_strips_casefolds_and_discards_empty_tags(self):
        self.assertEqual(
            normalize_tags(["  Python ", "STRASSE", " Straße ", "\t\n"]),
            ["python", "strasse"],
        )

    def test_deduplicates_normalized_tags_in_first_occurrence_order(self):
        self.assertEqual(
            normalize_tags([" Beta ", "alpha", "BETA", " ALPHA ", "gamma"]),
            ["beta", "alpha", "gamma"],
        )

    def test_returns_new_list_without_mutating_input(self):
        tags = [" One ", "ONE", "Two"]

        result = normalize_tags(tags)

        self.assertEqual(tags, [" One ", "ONE", "Two"])
        self.assertEqual(result, ["one", "two"])
        self.assertIsNot(result, tags)

    def test_rejects_non_list_input(self):
        with self.assertRaises(TypeError):
            normalize_tags(("tag",))

    def test_validates_elements_after_empty_and_duplicate_tags(self):
        with self.assertRaises(TypeError):
            normalize_tags([" ", "tag", "TAG", 3])


if __name__ == "__main__":
    unittest.main()
