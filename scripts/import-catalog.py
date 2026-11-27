"""Build deterministic local catalogs. Run from repo root with Python 3."""
import argparse
import collections
import csv
import hashlib
import io
import json
import math
import re
import shutil
import urllib.request
import zipfile
from difflib import SequenceMatcher
from pathlib import Path

from catalog_import_support import (
    EXACT_PORTION_LABELS, MASS_IN_GRAMS, UNIT_LABELS, normalize, normalize_unit,
    quantity_value, records,
)

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
    'corpus.jsonl': (
        'https://raw.githubusercontent.com/Rippy1911/open-recipe-corpus/86102603bac07d79b94bc35cba5b50346798cc09/data/recipes.jsonl',
        '98f65ffb6b9beff835014e4be4daf55a79d9e316fd8ebf2d995ebf8e7c638d96',
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
CONTEXT_ALIASES = {('souvlaki', 'thick yoghurt'): 'thick whole greek yogurt'}
# ICUC's level-spoon measurements for the ground form, distributed by FAO.
# https://www.fao.org/fileadmin/templates/inpho/documents/AE618e.pdf
REFERENCE_PORTIONS = {
    (170923, '@ground-cumin-tsp'): 2.5,
    (170923, '@ground-cumin-tbsp'): 7.5,
    (170922, '@ground-coriander-tsp'): 2.0,
    (170922, '@ground-coriander-tbsp'): 6.0,
}


def source(cache, name):
    path = cache / name
    url, digest = SOURCES[name]
    if not path.exists():
        temporary = path.with_suffix(path.suffix + '.download')
        try:
            with urllib.request.urlopen(url, timeout=45) as response, temporary.open('wb') as output:
                shutil.copyfileobj(response, output)
            with temporary.open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
                    raise ValueError(f'Unexpected version of {name}')
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != digest:
        raise ValueError(f'Unexpected checksum for {path}')
    return path


def load_usda(data):
    with zipfile.ZipFile(data) as archive:
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
        ids, en, fdc, ru, piece, tsp, tbsp, ml = (
            '' if value == '-' else value for value in line.split('\t')
        )
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


def resolve(item, mapping, products, portions, slug, exact_products):
    name = item['name']['en']
    unit = normalize_unit(item['unit'])
    if normalize(name) in {'salt', 'sea salt', 'salt and pepper', 'salt for the water', 'black pepper'} and unit in {'toTaste', 'pinch'}:
        return None
    try:
        quantity, is_range = quantity_value(item['quantity'])
    except (ValueError, OverflowError, ZeroDivisionError) as error:
        raise ValueError(f'{error}: {name}') from error
    label = item['name']['ru']
    override = RECIPE_MEASURES.get((slug, item['id']))
    if override:
        key, modifier, label = override
        match = (key, {'piece': modifier})
    else:
        normalized = CONTEXT_ALIASES.get((slug, normalize(name)), normalize(name))
        match = mapping.get((item['id'], normalized)) or mapping.get(('*', normalized))
        food_id = re.fullmatch(r'fdc-(\d+)', item['id'])
        if food_id:
            key = int(food_id[1])
            if key not in products or (match and match[0] != key):
                raise ValueError('conflicting or unknown FDC ID: ' + name)
            match = match or (key, {})
        if not match:
            candidates = exact_products.get(normalized, ())
            if len(candidates) == 1:
                match = (candidates[0], {})
    if not match:
        raise ValueError('unmapped ingredient: ' + name)
    key, measures = match
    if isinstance(key, int) and key not in products:
        raise ValueError('missing nutrition: ' + name)
    if unit in MASS_IN_GRAMS:
        multiplier = MASS_IN_GRAMS[unit]
    else:
        modifier = measures.get(unit)
        if not modifier:
            modifier = next((label for label in EXACT_PORTION_LABELS.get(unit, ())
                             if label in portions.get(key, {})), None)
        if (not modifier or (unit == 'clove' and 'clove' not in modifier)
                or (unit == 'sprig' and 'sprig' not in modifier)
                or (unit == 'slice' and 'slice' not in modifier)):
            raise ValueError(f'unsupported measure: {name} ({unit})')
        if modifier == '@water':
            multiplier = 1000 if unit == 'l' else 1
        elif unit in {'ml', 'l'}:
            # SR Legacy volume for one US customary cup, tablespoon or fluid ounce.
            measure, volume = modifier.split(':')
            multiplier = measure_mass(portions, key, measure, name, unit) / float(volume)
            if unit == 'l':
                multiplier *= 1000
        elif modifier.startswith('@cup/'):
            multiplier = measure_mass(portions, key, 'cup', name, unit) / int(modifier.removeprefix('@cup/'))
        else:
            multiplier = measure_mass(portions, key, modifier, name, unit)
    grams = quantity * multiplier
    if not math.isfinite(grams) or grams <= 0:
        raise ValueError(f'invalid converted mass: {name} ({unit})')
    if 'plantain' in normalize(name):
        label = label if key not in (168215, 169130) else (
            'Зелёный банан плантан' if key == 168215 else 'Спелый банан плантан')
    result = [f'fdc-{key}' if isinstance(key, int) else key, grams, label]
    if unit != 'g' or is_range:
        original = str(item['quantity']).replace('.', ',')
        result.append(f'{original} {UNIT_LABELS[unit]}'.rstrip())
    return result


def measure_mass(portions, key, modifier, name, unit):
    value = REFERENCE_PORTIONS.get((key, modifier), portions.get(key, {}).get(modifier))
    if value is None:
        raise ValueError(f'unverified portion: {name} ({unit})')
    return value


def convert_recipes(data, mapping, products, portions):
    cuisines = {c['code']: c['cuisine']['ru'].capitalize() for c in data['countries']}
    baseline = '\n'.join(p.read_text(encoding='utf-8') for p in RECIPES.glob('library-data*.ts'))
    names = {normalize(name) for name in re.findall(r"'([^'\n]+)'", baseline)}
    names.update(normalize(line.split('|')[1]) for line in baseline.splitlines()
                 if re.match(r'^[a-z0-9-]+\|', line))
    legacy = set((ROOT / 'scripts/catalog-legacy-recipes.txt').read_text().split())
    exact_products = collections.defaultdict(list)
    for product_id, (product_name, _, _) in products.items():
        exact_products[normalize(product_name)].append(product_id)
    ids, signatures, accepted, rejected, ingredient_issues, warnings = set(), set(), [], {}, {}, {}
    for row in sorted(data['recipes'], key=lambda row: row['slug'] not in legacy):
        slug = row['slug']
        try:
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or slug in ids:
                raise ValueError('invalid or duplicate ID')
            ids.add(slug)
            name, description = row['name']['ru'].strip(), row['summary']['ru'].strip()
            steps = [step['text']['ru'].strip() for step in row['steps']]
            if not name or not description or len(steps) < 2 or not all(steps):
                raise ValueError('incomplete Russian text')
            prep, cook, servings = (row[k] for k in ('prepMinutes', 'cookMinutes', 'baseServings'))
            if not all(type(n) is int and n >= 0 for n in (prep, cook, servings)) or not servings or not prep + cook:
                raise ValueError('invalid servings or time')
            ingredients = []
            omitted = []
            issues = []
            for item in row['ingredients']:
                try:
                    resolved = resolve(item, mapping, products, portions, slug, exact_products)
                except (ValueError, KeyError) as error:
                    issues.append(dict(id=item['id'], en=item['name']['en'], ru=item['name']['ru'],
                                       unit=item['unit'], quantity=item['quantity'], reason=str(error)))
                    continue
                if resolved:
                    ingredients.append(resolved)
                else:
                    omitted.append(item['name']['ru'])
            if issues:
                ingredient_issues[slug] = issues
                raise ValueError(issues[0]['reason'])
            if not ingredients:
                raise ValueError('empty ingredient list')
            totals = collections.defaultdict(float)
            for key, grams, *_ in ingredients:
                totals[key] += grams
            total_mass = sum(totals.values())
            signature = tuple(sorted((key, round(grams / total_mass, 3)) for key, grams in totals.items()))
            title = normalize(name)
            signatures_for_title = (title, signature) in signatures
            if title in names or signatures_for_title:
                if slug not in legacy:
                    if signatures_for_title:
                        raise ValueError('duplicate recipe and proportions')
                    # Baseline recipes use a different source schema. A title
                    # collision needs a composition review before admission.
                    warnings[slug] = ['same title; compare original composition and method']
                    raise ValueError('title collision requires review')
            kcal = sum(products[int(key[4:])][2][0] * grams / 100
                       for key, grams, *_ in ingredients if key.startswith('fdc-')) / servings
            reference = row['nutritionPerServing']['calories']
            if not math.isfinite(reference) or reference <= 0 or not 0.5 <= kcal / reference <= 1.65:
                raise ValueError('inconsistent energy estimate')
            cuisine = cuisines[row['country']]
            tags = [cuisine]
            recipe = dict(
                id=f'unitools-{slug}', name=name, description=description,
                searchNames=[row['name']['en']],
                category=DISHES[row['category']], tags=tags, ingredients=ingredients,
                servings=servings, prep=prep, cook=cook, difficulty=DIFFICULTIES[row['difficulty']],
                steps=steps, source=ATTRIBUTION, cuisine=cuisine,
            )
            if omitted:
                recipe['seasoningNote'] = ('По вкусу, вне расчёта КБЖУ: '
                                           + ', '.join(dict.fromkeys(omitted)) + '.')
            accepted.append(recipe)
            names.add(normalize(name))
            signatures.add((title, signature))
        except (ValueError, KeyError) as error:
            rejected[slug] = str(error)
    missing_legacy = legacy.difference(row['id'].removeprefix('unitools-') for row in accepted)
    if missing_legacy:
        raise ValueError(f'Published recipes failed validation: {sorted(missing_legacy)}')
    return accepted, rejected, ingredient_issues, warnings


def import_wikibooks(cache, mapping, products, portions, existing):
    translations = {row['id']: row for row in records(ROOT / 'scripts/catalog-wikibooks-ru.jsonl')}
    imported = []
    counters = collections.Counter()
    names = {normalize(row['name']) for row in existing}
    for row in records(source(cache, 'corpus.jsonl')):
        counters['records'] += 1
        translation = translations.pop(row['id'], None)
        if translation is None:
            counters['no reviewed Russian translation'] += 1
            continue
        provenance = row['provenance']
        if (provenance['source'], provenance['source_license'], provenance['license']) != (
                'pl-wikibooks', 'CC-BY-SA-4.0', 'CC-BY-SA-4.0'):
            raise ValueError(f'Unverified licence for {row["id"]}')
        if not re.fullmatch(r'plwb:\d+', row['id']) or not (
                provenance['url'].startswith('https://pl.wikibooks.org/wiki/')
                and type(provenance.get('revision')) is int):
            raise ValueError(f'Unverified provenance for {row["id"]}')
        if len(row['ingredients']) != len(translation['ingredients']):
            raise ValueError(f'Ingredient translation count differs for {row["id"]}')
        if not type(row['servings']) is int or row['servings'] <= 0:
            raise ValueError(f'Unverified servings for {row["id"]}')
        if len(translation['steps']) < 2 or normalize(translation['name']) in names:
            raise ValueError(f'Invalid or duplicate translation for {row["id"]}')
        ingredients = []
        for measure, (name, label, *range_override) in zip(row['ingredients'], translation['ingredients']):
            ingredients.append(resolve(
                dict(id=normalize(name).replace(' ', ''), name=dict(en=name, ru=label),
                     unit=measure['unit'], quantity=range_override[0] if range_override else measure['qty']),
                mapping, products, portions, row['id'], {},
            ))
        cuisine = {'italian': 'Итальянская кухня', 'polish': 'Польская кухня'}.get(row['cuisine'])
        imported.append(dict(
            id=row['id'].replace('plwb:', 'wikibooks-pl-'),
            name=translation['name'], description=translation['description'],
            searchNames=[provenance['title'].split('/', 1)[-1]],
            category=translation['category'], ingredients=ingredients,
            servings=row['servings'], tags=[], steps=translation['steps'],
            **{key: value for key, value in row['time_min'].items() if value is not None},
            **({'cuisine': cuisine} if cuisine else {}),
            source=f'Авторы польского Wikibooks · {provenance["url"]} · редакция {provenance["revision"]} · '
                   'Open Recipe Corpus · CC BY-SA 4.0 · перевод и пересчёт MassTracker',
        ))
        names.add(normalize(translation['name']))
    if translations:
        raise ValueError(f'Missing Wikibooks records: {list(translations)}')
    counters['accepted'] = len(imported)
    return imported, dict(counters)


def select_products(products, localized_names, recipes):
    baseline = (FOOD / 'catalog-usda.ts').read_text(encoding='utf-8')
    legacy_ids = {int(key) for key in re.findall(r'\[\s*(\d+)\s*,\s*\x27', baseline)}
    required = {int(i[0][4:]) for r in recipes for i in r['ingredients'] if i[0].startswith('fdc-')}
    required.update(map(int, (ROOT / 'scripts/catalog-legacy-products.txt').read_text().split()))
    rows = []
    for key in sorted(required - legacy_ids):
        name, category, macros = products[key]
        localized = localized_names.get(key, name)
        row = [key, localized, category, *macros, [name]]
        rows.append(row)
    if len(rows) < 1552:
        raise ValueError('Insufficient valid USDA products')
    return sorted(rows)


def write_module(path, declaration, rows):
    payload = ''.join('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) + ',\n'
                      for row in rows)
    path.write_text(f'// Generated by scripts/import-catalog.py.\n{declaration} [\n{payload}];\n',
                    encoding='utf-8', newline='\n')


def build_report(recipes, rejected, issues, warnings, products, localized_names):
    counts = collections.Counter((i['en'], i['ru'], i['unit'], i['reason'].split(':', 1)[0])
                                 for records in issues.values() for i in records)
    candidates = {}
    names = {key: normalize(row[0]) for key, row in products.items()}
    for en, ru, _, reason in counts:
        if reason != 'unmapped ingredient' or en in candidates:
            continue
        query = normalize(en)
        terms = set(query.split())
        ranked = []
        for key, name in names.items():
            localized = normalize(localized_names.get(key, ''))
            if not terms.intersection(name.split()) and not (localized and normalize(ru) == localized):
                continue
            score = max(SequenceMatcher(None, query, name).ratio(),
                        0.95 if localized and normalize(ru) == localized else 0)
            ranked.append((score, key))
        candidates[en] = [
            dict(fdcId=key, name=products[key][0], score=round(score, 3))
            for score, key in sorted(ranked, reverse=True)[:4]
        ]
    return dict(
        accepted=len(recipes), rejected=len(rejected),
        reasons=collections.Counter(reason.split(':', 1)[0] for reason in rejected.values()),
        categories=collections.Counter(row['category'] for row in recipes),
        cuisines=collections.Counter(row['cuisine'] for row in recipes),
        warnings=warnings, ingredientIssues=issues,
        ingredientCounts=[dict(en=en, ru=ru, unit=unit, reason=reason, count=count)
                          for (en, ru, unit, reason), count in counts.most_common()],
        reviewCandidates=candidates,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache', type=Path, help='Directory for source downloads and rejection report')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    products, portions = load_usda(source(args.cache, 'usda.zip'))
    mapping, localized_names = load_mapping()
    with source(args.cache, 'unitools.json').open(encoding='utf-8') as stream:
        data = json.load(stream)
    recipes, rejected, issues, warnings = convert_recipes(data, mapping, products, portions)
    wikibooks, corpus_report = import_wikibooks(args.cache, mapping, products, portions, recipes)
    foods = select_products(products, localized_names, [*recipes, *wikibooks])
    report = build_report(recipes, rejected, issues, warnings, products, localized_names)
    report['openRecipeCorpus'] = corpus_report
    report['localizedExpansionProducts'] = sum(bool(re.search('[А-Яа-яЁё]', row[1])) for row in foods)
    write_module(FOOD / 'catalog-usda-expansion.ts',
                 "// USDA ARS FoodData Central, SR Legacy (04/2018), CC0 1.0.\n"
                 "import type { FdcRow } from './catalog-usda';\n\n"
                 "// prettier-ignore\nexport const fdcExpansion: readonly FdcRow[] =", foods)
    write_module(RECIPES / 'library-unitools.ts',
                 "// Adapted from UniTools — theunitools.com. Recipe data: CC BY-SA 4.0.\n"
                 "// https://creativecommons.org/licenses/by-sa/4.0/\n"
                 "import type { LibraryRecipeData } from './library-types';\n\n"
                 "// prettier-ignore\nexport const unitoolsRecipes: readonly LibraryRecipeData[] =", recipes)
    write_module(RECIPES / 'library-wikibooks.ts',
                 "// Adapted from Polish Wikibooks via Open Recipe Corpus. CC BY-SA 4.0.\n"
                 "import type { LibraryRecipeData } from './library-types';\n\n"
                 "// prettier-ignore\nexport const wikibooksRecipes: readonly LibraryRecipeData[] =", wikibooks)
    (args.cache / 'rejected.json').write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding='utf-8')
    (args.cache / 'catalog-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Expansion: {len(foods)} products, {len(recipes)} UniTools recipes, '
          f'{len(wikibooks)} Wikibooks recipes. Rejected {len(rejected)} UniTools recipes.')


if __name__ == '__main__':
    main()
