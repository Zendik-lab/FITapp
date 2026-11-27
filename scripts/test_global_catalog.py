import unittest

from global_catalog_sources import barcode_key, off_product, sanitize_optional_measurements


class SourceTests(unittest.TestCase):
    def test_invalid_optional_measurements_are_omitted_without_losing_product(self):
        row = ['036000291452', 'Product', 1, '', 20, 1, 0, 4,
               {'serving': 100340, 'package': [2000000, 'g'], 'packageText': '2,000,000 g'}]
        self.assertEqual(sanitize_optional_measurements(row)[:8], row[:8])
        self.assertEqual(row[8], {'packageText': '2,000,000 g'})

    def test_barcode_key_keeps_gs1_equivalents_and_package_indicators(self):
        self.assertEqual(barcode_key('036000291452'), barcode_key('0036000291452'))
        self.assertIsNotNone(barcode_key('10012345678902'))
        self.assertIsNone(barcode_key('0000000000000'))
        self.assertIsNone(barcode_key('036000291453'))

    def test_off_does_not_impute_nutrients_or_country(self):
        row = {'code': '4870201430011', 'product_name': 'Продукт',
               'energy-kcal_100g': '40', 'proteins_100g': '1', 'fat_100g': '0',
               'carbohydrates_100g': '9', 'quantity': '500 ml'}
        row['code'] = '036000291452'
        product = off_product(row)
        self.assertEqual(product[8]['basis'], 'ml')
        self.assertEqual(product[6], 0)
        self.assertNotIn('sugar', product[8])
        self.assertNotIn('countries', product[8])
        self.assertIsNone(off_product({**row, 'fat_100g': ''}))


if __name__ == '__main__':
    unittest.main()
