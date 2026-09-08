import unittest

from tags import normalize_tags


class NormalizeTagsTests(unittest.TestCase):
    def test_strips_casefolds_discards_blanks_and_deduplicates_in_order(self):
        tags = ['  Python ', 'PYTHON', '', '  ', 'Straße', 'STRASSE', 'News']

        result = normalize_tags(tags)

        self.assertEqual(result, ['python', 'strasse', 'news'])
        self.assertEqual(
            tags,
            ['  Python ', 'PYTHON', '', '  ', 'Straße', 'STRASSE', 'News'],
        )
        self.assertIsNot(result, tags)

    def test_casefold_uses_python_unicode_behavior_without_accent_removal(self):
        self.assertEqual(normalize_tags([' CAFÉ ', 'cafe']), ['café', 'cafe'])

    def test_rejects_non_list_input(self):
        with self.assertRaises(TypeError):
            normalize_tags(('python',))

    def test_rejects_non_string_after_blank_and_duplicate(self):
        with self.assertRaises(TypeError):
            normalize_tags([' ', 'Python', 'PYTHON', 3])


if __name__ == '__main__':
    unittest.main()
