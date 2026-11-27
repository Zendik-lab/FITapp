"""Conservative quantity normalization for licensed catalog adapters."""
import csv
import io
import json
import math
import re
import unicodedata
import zipfile
from fractions import Fraction
from pathlib import PurePosixPath

MASS_IN_GRAMS = {
    'mg': .001, 'g': 1, 'kg': 1000, 'oz': 28.349523125, 'lb': 453.59237,
}
UNIT_ALIASES = {
    'мг': 'mg', 'г': 'g', 'кг': 'kg', 'мл': 'ml', 'л': 'l',
    'gram': 'g', 'grams': 'g', 'kilogram': 'kg', 'kilograms': 'kg',
    'milligram': 'mg', 'milligrams': 'mg', 'milliliter': 'ml', 'milliliters': 'ml',
    'millilitre': 'ml', 'millilitres': 'ml', 'liter': 'l', 'litre': 'l',
    't': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp', 'ч л': 'tsp',
    'tablespoon': 'tbsp', 'tablespoons': 'tbsp', 'ст л': 'tbsp',
    'cups': 'cup', 'чашка': 'cup', 'чашки': 'cup', 'стакан': 'glass', 'шт': 'piece',
    'pcs': 'piece', 'pieces': 'piece', 'cloves': 'clove', 'slices': 'slice', 'sprigs': 'sprig',
    'щепотка': 'pinch', 'пучок': 'bunch', 'порция': 'serving',
    'ounce': 'oz', 'ounces': 'oz', 'pound': 'lb', 'pounds': 'lb',
    'to taste': 'toTaste', 'по вкусу': 'toTaste',
}
UNIT_LABELS = {
    'mg': 'мг', 'g': 'г', 'kg': 'кг', 'ml': 'мл', 'l': 'л', 'oz': 'унц.',
    'lb': 'фунта', 'tsp': 'ч. л.', 'tbsp': 'ст. л.', 'cup': 'чашки',
    'glass': 'стакана', 'piece': 'шт.', 'slice': 'ломт.', 'clove': 'зубч.',
    'bunch': 'пуч.', 'sprig': 'вет.', 'pinch': 'щепотка', 'serving': 'порции',
}
EXACT_PORTION_LABELS = {
    'cup': ('cup', 'cup (8 fl oz)'),
    'glass': ('glass',),
    'bunch': ('bunch',),
    'serving': ('serving',),
    'pinch': ('pinch',),
}


def records(path, *, array_key=None, member=None):
    """Read records in source order; JSONL and delimited tables stream."""
    if path.suffix.lower() == '.zip':
        if not member:
            raise ValueError('Archive member must be declared by the adapter')
        with zipfile.ZipFile(path) as archive, archive.open(member) as stream:
            yield from read_records(io.TextIOWrapper(stream, encoding='utf-8-sig'),
                                    PurePosixPath(member).suffix.lower(), array_key)
        return
    with path.open(encoding='utf-8-sig', newline='') as stream:
        yield from read_records(stream, path.suffix.lower(), array_key)


def read_records(stream, suffix, array_key):
    if suffix == '.json':
        data = json.load(stream)
        yield from data[array_key] if array_key else data
    elif suffix == '.jsonl':
        yield from (json.loads(line) for line in stream if line.strip())
    elif suffix in {'.csv', '.tsv'}:
        yield from csv.DictReader(stream, delimiter=',' if suffix == '.csv' else '\t')
    else:
        raise ValueError(f'Unsupported record format: {suffix}')


def normalize(text):
    return re.sub(r'[^\w]+|_', ' ', unicodedata.normalize('NFKC', text).casefold().replace('ё', 'е')).strip()


def normalize_unit(unit):
    key = normalize(unit)
    return UNIT_ALIASES.get(key, 'toTaste' if key == 'totaste' else key)


def quantity_value(value):
    if type(value) in (float, int):
        result, approximate = float(value), False
    elif isinstance(value, str):
        pieces = re.split(r'\s*[-–—]\s*', value.strip())
        if len(pieces) > 2:
            raise ValueError('invalid quantity range')
        values = []
        for piece in pieces:
            piece = re.sub(r'(?<=\d)(?=[¼½¾⅓⅔⅛⅜⅝⅞])', ' ', piece)
            parts = unicodedata.normalize('NFKC', piece).replace('⁄', '/').replace(',', '.').split()
            if not parts or len(parts) > 2 or (len(parts) == 2 and not (
                    parts[0].isdigit() and '/' in parts[1])):
                raise ValueError('invalid quantity')
            values.append(float(sum(Fraction(part) for part in parts)))
        if any(number <= 0 for number in values) or values != sorted(values):
            raise ValueError('invalid quantity range')
        result, approximate = sum(values) / len(values), len(values) > 1
    else:
        raise ValueError('no quantity')
    if not math.isfinite(result) or result <= 0:
        raise ValueError('invalid quantity')
    return result, approximate
