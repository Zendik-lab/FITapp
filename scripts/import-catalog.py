"""Build deterministic local catalogs. Run from repo root with Python 3."""
import argparse
import collections
import csv
import hashlib
import io
import json
import math
import re
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOOD = ROOT / 'src/features/food'
RECIPES = ROOT / 'src/features/recipes'
SOURCES = {
    'usda.zip': (
        'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
        'b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0',
    ),
    'unitools.json': (
        'https://theunitools.com/data/unitools-recipes-v1.json',
        '41fdc0572b7272ca557d2df22a0fac1cc1f18146e97ebd2c8258c395daf87d8a',
    ),
}
CATEGORIES = {
    1: 3, 2: 15, 4: 10, 5: 0, 6: 16, 7: 0, 8: 4, 9: 8, 10: 0,
    11: 7, 12: 9, 13: 0, 14: 11, 15: 1, 16: 4, 17: 0, 18: 6, 19: 12,
    20: 4, 21: 14, 22: 14, 23: 14, 24: 14, 25: 14, 28: 11,
}
DISHES = dict(zip(
    ('breakfast', 'main', 'soup', 'salad', 'snack', 'dessert', 'bread', 'side', 'drink', 'sauce'),
    ('Завтраки', 'Основные блюда', 'Супы', 'Салаты', 'Перекусы', 'Десерты', 'Выпечка',
     'Гарниры', 'Напитки', 'Другое'),
))
DIFFICULTIES = {'easy': 'Простой', 'medium': 'Средний', 'hard': 'Сложный'}
ATTRIBUTION = 'UniTools — theunitools.com · CC BY-SA 4.0 · адаптация MassTracker'
# UniTools lists whole lemons in Tabule, but the steps use only their juice.
RECIPE_MEASURES = {('tabbouleh', 'lemon'): (167747, 'lemon yields', 'Сок лимона')}


def source(cache, name):
    path = cache / name
    url, digest = SOURCES[name]
    if not path.exists():
        data = urllib.request.urlopen(url, timeout=45).read()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f'Unexpected version of {name}')
        path.write_bytes(data)
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f'Unexpected checksum for {path}')
    return data


def normalize(text):
    return re.sub(r'[^\w]+', ' ', unicodedata.normalize('NFKC', text).lower().replace('ё', 'е')).strip()


def load_usda(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        def rows(table):
            name = next(name for name in archive.namelist() if name.endswith(f'/{table}.csv'))
            with archive.open(name) as stream:
                yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8'))

        nutrient_ids = ('1008', '1003', '1004', '1005')
        nutrients = collections.defaultdict(dict)
        for row in rows('food_nutrient'):
            if row['nutrient_id'] in nutrient_ids and row['amount']:
                nutrients[int(row['fdc_id'])][row['nutrient_id']] = float(row['amount'])
        products = {}
        for row in rows('food'):
            fdc = int(row['fdc_id'])
            values = nutrients[fdc]
            category = CATEGORIES.get(int(row['food_category_id'] or 0))
            if len(values) != 4 or category is None:
                continue
            macros = [values[key] for key in nutrient_ids]
            if not all(math.isfinite(n) and n >= 0 for n in macros):
                continue
            if macros[0] > 900 or sum(macros[1:]) > 100.5:
                continue
            name = row['description'].split(' (Includes foods for USDA')[0].strip()
            if name.startswith(('Egg,', 'Eggs,')):
                category = 2
            if name.startswith(('Pasta,', 'Noodles,')):
                category = 5
            products[fdc] = (name, category, macros)
        portions = collections.defaultdict(dict)
        for row in rows('food_portion'):
            if row['amount'] and row['gram_weight'] and float(row['amount']) > 0:
                portions[int(row['fdc_id'])][row['modifier']] = (
                    float(row['gram_weight']) / float(row['amount'])
                )
        return products, portions


def load_mapping():
    mapping = {}
    localized_names = {}
    for line in (ROOT / 'scripts/catalog-ingredient-map.tsv').read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        ids, en, fdc, ru, piece, tsp, tbsp, ml = line.split('\t')
        key = int(fdc) if fdc.isdigit() else fdc
        if ru:
            localized_names[key] = ru
        for ingredient_id in ids.split('|'):
            for name in en.split('|'):
                identity = (ingredient_id, normalize(name))
                if identity in mapping:
                    raise ValueError(f'Duplicate ingredient mapping: {identity}')
                mapping[identity] = (key, {'piece': piece, 'clove': piece, 'sprig': piece,
                                           'slice': piece, 'tsp': tsp, 'tbsp': tbsp, 'ml': ml, 'l': ml})
    return mapping, localized_names


def resolve(item, mapping, products, portions, slug):
    name = item['name']['en']
    unit, quantity = item['unit'], item['quantity']
    if normalize(name) in {'salt', 'sea salt', 'salt and pepper', 'salt for the water', 'black pepper'} and unit in {'toTaste', 'pinch'}:
        return None
    if not isinstance(quantity, (int, float)) or not math.isfinite(quantity) or quantity <= 0:
        raise ValueError('no quantity: ' + name)
    label = item['name']['ru']
    override = RECIPE_MEASURES.get((slug, item['id']))
    if override:
        key, modifier, label = override
        match = (key, {'piece': modifier})
    else:
        match = mapping.get((item['id'], normalize(name)))
    if not match:
        raise ValueError('unmapped ingredient: ' + name)
    key, measures = match
    if isinstance(key, int) and key not in products:
        raise ValueError('missing nutrition: ' + name)
    if unit in {'g', 'kg'}:
        multiplier = 1000 if unit == 'kg' else 1
    else:
        modifier = measures.get(unit)
        if (not modifier or (unit == 'clove' and 'clove' not in modifier)
                or (unit == 'sprig' and 'sprig' not in modifier)
                or (unit == 'slice' and 'slice' not in modifier)):
            raise ValueError(f'unsupported measure: {name} ({unit})')
        if modifier == '@water':
            multiplier = 1000 if unit == 'l' else 1
        elif unit in {'ml', 'l'}:
            # SR Legacy volume for one US customary cup, tablespoon or fluid ounce.
            measure, volume = modifier.split(':')
            multiplier = portions[key][measure] / float(volume)
            if unit == 'l':
                multiplier *= 1000
        elif modifier.startswith('@cup/'):
            multiplier = portions[key]['cup'] / int(modifier.removeprefix('@cup/'))
        else:
            multiplier = portions[key][modifier]
    return [f'fdc-{key}' if isinstance(key, int) else key, round(quantity * multiplier, 4), label]


def convert_recipes(data, mapping, products, portions):
    cuisines = {c['code']: c['cuisine']['ru'] for c in data['countries']}
    baseline = '\n'.join(p.read_text(encoding='utf-8') for p in RECIPES.glob('library-data*.ts'))
    names = {normalize(name) for name in re.findall(r"'([^'\n]+)'", baseline)}
    names.update(normalize(line.split('|')[1]) for line in baseline.splitlines()
                 if re.match(r'^[a-z0-9-]+\|', line))
    ids, signatures, accepted, rejected = set(), set(), [], {}
    for row in data['recipes']:
        slug = row['slug']
        try:
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or slug in ids:
                raise ValueError('invalid or duplicate ID')
            ids.add(slug)
            name, description = row['name']['ru'].strip(), row['summary']['ru'].strip()
            steps = [step['text']['ru'].strip() for step in row['steps']]
            if not name or not description or len(steps) < 2 or not all(steps):
                raise ValueError('incomplete Russian text')
            if normalize(name) in names:
                raise ValueError('duplicate title')
            prep, cook, servings = (row[k] for k in ('prepMinutes', 'cookMinutes', 'baseServings'))
            if not all(type(n) is int and n >= 0 for n in (prep, cook, servings)) or not servings or not prep + cook:
                raise ValueError('invalid servings or time')
            ingredients = []
            omitted = []
            for item in row['ingredients']:
                resolved = resolve(item, mapping, products, portions, slug)
                if resolved:
                    ingredients.append(resolved)
                else:
                    omitted.append(item['name']['ru'])
            signature = tuple(sorted(i[0] for i in ingredients))
            if not ingredients or signature in signatures:
                raise ValueError('empty or duplicate ingredient list')
            kcal = sum(products[int(key[4:])][2][0] * grams / 100
                       for key, grams, _ in ingredients if key.startswith('fdc-')) / servings
            reference = row['nutritionPerServing']['calories']
            if not math.isfinite(reference) or reference <= 0 or not 0.5 <= kcal / reference <= 1.65:
                raise ValueError('inconsistent energy estimate')
            cuisine = cuisines[row['country']]
            tags = [cuisine]
            recipe = dict(
                id=f'unitools-{slug}', name=name, description=description,
                category=DISHES[row['category']], tags=tags, ingredients=ingredients,
                servings=servings, prep=prep, cook=cook, difficulty=DIFFICULTIES[row['difficulty']],
                steps=steps, source=ATTRIBUTION,
            )
            if omitted:
                recipe['seasoningNote'] = ('По вкусу, вне расчёта КБЖУ: '
                                           + ', '.join(dict.fromkeys(omitted)) + '.')
            accepted.append(recipe)
            names.add(normalize(name))
            signatures.add(signature)
        except (ValueError, KeyError) as error:
            rejected[slug] = str(error)
    return accepted, rejected


def select_products(products, localized_names, recipes):
    baseline = (FOOD / 'catalog-usda.ts').read_text(encoding='utf-8')
    legacy_ids = {int(key) for key in re.findall(r'\[\s*(\d+)\s*,\s*\x27', baseline)}
    names = {normalize(products[key][0]) for key in legacy_ids if key in products}
    names.update(normalize(name) for name in re.findall(r"'([^'\n]+)'", baseline))
    required = {int(i[0][4:]) for r in recipes for i in r['ingredients'] if i[0].startswith('fdc-')}
    rows = []
    groups = collections.defaultdict(collections.deque)
    for key, (name, category, macros) in sorted(products.items(), key=lambda pair: (len(pair[1][0]), pair[0])):
        if key in legacy_ids:
            continue
        localized = localized_names.get(key, name)
        row = [key, localized, category, *macros, [name]]
        if key in required:
            rows.append(row)
            names.update((normalize(name), normalize(localized)))
        else:
            groups[category].append(row)
    while len(rows) < 1552 and any(groups.values()):
        for group in groups.values():
            while group and len(rows) < 1552:
                row = group.popleft()
                if normalize(row[1]) not in names:
                    rows.append(row)
                    names.add(normalize(row[1]))
                    break
    if len(rows) < 1552:
        raise ValueError('Insufficient valid USDA products')
    return sorted(rows)


def write_module(path, declaration, rows):
    payload = ''.join('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) + ',\n'
                      for row in rows)
    path.write_text(f'// Generated by scripts/import-catalog.py.\n{declaration} [\n{payload}];\n',
                    encoding='utf-8', newline='\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache', type=Path, help='Directory for source downloads and rejection report')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    products, portions = load_usda(source(args.cache, 'usda.zip'))
    mapping, localized_names = load_mapping()
    data = json.loads(source(args.cache, 'unitools.json'))
    recipes, rejected = convert_recipes(data, mapping, products, portions)
    foods = select_products(products, localized_names, recipes)
    write_module(FOOD / 'catalog-usda-expansion.ts',
                 "// USDA ARS FoodData Central, SR Legacy (04/2018), CC0 1.0.\n"
                 "import type { FdcRow } from './catalog-usda';\n\n"
                 "// prettier-ignore\nexport const fdcExpansion: readonly FdcRow[] =", foods)
    write_module(RECIPES / 'library-unitools.ts',
                 "// Adapted from UniTools — theunitools.com. Recipe data: CC BY-SA 4.0.\n"
                 "// https://creativecommons.org/licenses/by-sa/4.0/\n"
                 "import type { LibraryRecipeData } from './library-types';\n\n"
                 "// prettier-ignore\nexport const unitoolsRecipes: readonly LibraryRecipeData[] =", recipes)
    (args.cache / 'rejected.json').write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Added {len(foods)} products and {len(recipes)} recipes. Rejected {len(rejected)} recipes.')


if __name__ == '__main__':
    main()
