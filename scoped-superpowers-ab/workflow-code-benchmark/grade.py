"""Independent black-box acceptance tests; copied into a separate grading directory."""
import importlib.util,json,pathlib,sys,unittest
p=pathlib.Path(sys.argv.pop(1));spec=importlib.util.spec_from_file_location('submitted_tags',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);f=m.normalize_tags
class ContractTests(unittest.TestCase):
    def test_empty(self):self.assertEqual(f([]),[])
    def test_whitespace(self):self.assertEqual(f([' ','\t','\n']),[])
    def test_case(self):self.assertEqual(f([' PyThOn ','PYTHON','python']),['python'])
    def test_order(self):self.assertEqual(f(['b','a','B','c','a']),['b','a','c'])
    def test_unicode_casefold(self):self.assertEqual(f(['Straße','STRASSE','Σ','ς']),['strasse','σ'])
    def test_unicode_strip(self):self.assertEqual(f(['\u2003 X \u00a0']),['x'])
    def test_no_accent_removal(self):self.assertEqual(f(['é','e']),['é','e'])
    def test_no_unicode_normalization(self):self.assertEqual(f(['é','e\u0301']),['é','e\u0301'])
    def test_internal_spaces(self):self.assertEqual(f([' a b ','a  b']),['a b','a  b'])
    def test_input_unchanged(self):
        source=[' B ','a','B'];copy=source[:];result=f(source);self.assertEqual(source,copy);self.assertIsNot(source,result)
    def test_empty_new_list(self):
        source=[];self.assertIsNot(f(source),source)
    def test_container_types(self):
        for value in [None,'abc',('a',),{'a'},iter(['a']),123]:
            with self.subTest(value=type(value).__name__),self.assertRaises(TypeError):f(value)
    def test_element_types(self):
        for value in [None,1,False,[],{},b'a']:
            with self.subTest(value=type(value).__name__),self.assertRaises(TypeError):f(['a',value])
    def test_invalid_after_empty_duplicate(self):
        with self.assertRaises(TypeError):f(['','a','A',7])
result=unittest.TextTestRunner(verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(ContractTests))
print(json.dumps({'tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful()}))
sys.exit(0 if result.wasSuccessful() else 1)
