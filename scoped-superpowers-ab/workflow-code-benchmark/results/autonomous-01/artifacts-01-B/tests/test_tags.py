import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_strips_casefolds_discards_blanks_and_deduplicates_in_order(self):
        tags = ["  Straße ", "STRASSE", "", " Python ", "PYTHON", "　"]

        result = normalize_tags(tags)

        self.assertEqual(result, ["strasse", "python"])

    def test_does_not_mutate_input(self):
        tags = [" One ", "ONE", "Two"]
        original = tags.copy()

        normalize_tags(tags)

        self.assertEqual(tags, original)

    def test_rejects_non_list_input(self):
        with self.assertRaises(TypeError):
            normalize_tags(("tag",))

    def test_validates_non_string_after_ignored_values(self):
        with self.assertRaises(TypeError):
            normalize_tags(["", "TAG", "tag", 1])


if __name__ == "__main__":
    unittest.main()
