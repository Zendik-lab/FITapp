"""Contract tests for the offline catalog import formats and conversions."""
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from catalog_import_support import normalize, normalize_unit, quantity_value, records


class CatalogImportTest(unittest.TestCase):
    def test_normalization_preserves_food_state(self):
        self.assertEqual(normalize('  ТЁПЛОЕ_МОЛОКО '), 'теплое молоко')
        self.assertNotEqual(normalize('сухой рис'), normalize('варёный рис'))
        self.assertEqual(normalize_unit('ст. л.'), 'tbsp')
        self.assertEqual(normalize_unit('стакан'), 'glass')

    def test_positive_quantities_and_ranges(self):
        self.assertEqual(quantity_value('1½'), (1.5, False))
        self.assertEqual(quantity_value('1 1/4 – 2,75'), (2, True))
        for invalid in [True, float('nan'), float('inf'), -1, '4–2', '0–2', '1/0']:
            with self.subTest(invalid=invalid):
                with self.assertRaises((ValueError, ZeroDivisionError)):
                    quantity_value(invalid)

    def test_records_across_supported_formats(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            row = {'title': 'Рецепт', 'amount': '¼'}
            for filename, contents, options in [
                ('rows.json', json.dumps({'recipes': [row]}), {'array_key': 'recipes'}),
                ('rows.jsonl', json.dumps(row) + '\n', {}),
                ('rows.csv', 'title,amount\nРецепт,¼\n', {}),
                ('rows.tsv', 'title\tamount\nРецепт\t¼\n', {}),
            ]:
                with self.subTest(filename=filename):
                    file = root / filename
                    file.write_text(contents, encoding='utf-8')
                    self.assertEqual(list(records(file, **options)), [row])
            archive = root / 'rows.zip'
            with zipfile.ZipFile(archive, 'w') as output:
                output.write(root / 'rows.csv', 'source/rows.csv')
            self.assertEqual(list(records(archive, member='source/rows.csv')), [row])
            with self.assertRaises(ValueError):
                list(records(archive))


if __name__ == '__main__':
    unittest.main()
