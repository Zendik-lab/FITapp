"""Source adapters for licensed, label-based product catalogs."""
import csv
import gzip
import io
import json
import math
import re
import zipfile

OFF_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'
USDA_URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2026-10-29.zip'
CIS = {'russia', 'belarus', 'ukraine', 'uzbekistan', 'kyrgyzstan', 'armenia', 'azerbaijan',
       'tajikistan', 'turkmenistan', 'moldova', 'georgia'}
POPULAR = re.compile(
    r'food\s*master|фудмастер|адал|молочный союз|рахат|rakhat|баян сулу|bayan sulu|'
    r'султан|sultan|цесна|tsesna|шин[- ]?лайн|shin[- ]?line|простоквашино|'
    r'домик в деревне|агуша|danone|activia|actimel|nestl[eé]|heinz|coca[- ]?cola|pepsi|'
    r'lay[’\x27]?s\b|pringles|cheetos|oreo|milka|alpen gold|kinder|snickers|сникерс|'
    r'\bmars\b|twix|bounty|barilla|макфа|makfa|доширак|doshirak|роллтон|rollton', re.I)
MEASURE = re.compile(r'(\d+(?:[.,]\d+)?)\s*(fl\s*oz|kg|mg|g|ml|cl|dl|l|кг|мг|г|мл|л)(?![\w])', re.I)
UNITS = {'kg': ('g', 1000), 'mg': ('g', .001), 'g': ('g', 1), 'ml': ('ml', 1),
         'cl': ('ml', 10), 'dl': ('ml', 100), 'l': ('ml', 1000), 'fl oz': ('ml', 29.5735295625),
         'кг': ('g', 1000), 'мг': ('g', .001), 'г': ('g', 1), 'мл': ('ml', 1), 'л': ('ml', 1000)}
CLASSIFIERS = [
    (13, r'sports[- ]nutrition|protein[- ](?:bars|powders|supplements)|gainers|bodybuilding|sport food|протеин|гейнер'),
    (3, r'dair|yog[uoh]|milk|cheese|kefir|cream|молок|кефир|творог|йогурт'),
    (1, r'fish|seafood|salmon|tuna|рыб|морепродукт'),
    (2, r'\beggs?\b|яйц'),
    (0, r'meat|poultry|chicken|beef|sausages|мяс|колбас|птиц'),
    (5, r'pasta|noodles|макарон|лапш'),
    (6, r'breads?|bakery|crackers|хлеб|булоч'),
    (4, r'cereal|rice|grain|flour|oats|круп|рис|овсян'),
    (9, r'nuts|seeds|орех|семеч'),
    (10, r'\boils?\b|fats|масл'),
    (11, r'beverages|drinks|juices|waters|sodas|tea\b|coffee|напит|сок'),
    (12, r'chocolat|cand(?:y|ies)|sweets|confection|dessert|cookies|шоколад|конфет'),
    (16, r'sauces|dressings|ketchup|соус'),
    (15, r'spices|herbs|seasonings|специ'),
    (7, r'vegetables|legumes|овощ'),
    (8, r'fruits|berries|фрукт|ягод'),
]
CLASSIFIERS = [(key, re.compile(pattern, re.I)) for key, pattern in CLASSIFIERS]
OFF_FIELDS = ('code product_name abbreviated_product_name generic_name quantity brands categories_tags '
              'countries_tags ingredients_text allergens_en serving_size no_nutrition_data brand_owner '
              'data_quality_errors_tags unique_scans_n completeness created_datetime last_modified_datetime '
              'main_category_en energy-kcal_100g energy_100g proteins_100g fat_100g carbohydrates_100g '
              'sugars_100g fiber_100g saturated-fat_100g salt_100g').split()
USDA_NUTRIENTS = {'1008': 0, '1003': 1, '1004': 2, '1005': 3, '2000': 4,
                  '1079': 5, '1258': 6, '1093': 7}
EXTRA = ('sugar', 'fiber', 'saturatedFat', 'salt')


def barcode_key(code):
    if not re.fullmatch(r'(?:[0-9]{8}|[0-9]{12,14})', code) or not int(code):
        return None
    if sum(int(ch) * (1 if i % 2 == 0 else 3) for i, ch in enumerate(reversed(code))) % 10:
        return None
    return code.zfill(14)


def number(value):
    try:
        number_value = float(value)
        return number_value if math.isfinite(number_value) and number_value >= 0 else None
    except (ValueError, TypeError):
        return None


def valid_macros(values):
    return (None not in values and values[0] <= 950 and sum(values[1:]) <= 105
            and max(values[1:]) <= 100 and (values[0] > 0 or sum(values[1:]) <= 1))


def clean(value, limit=320):
    return ' '.join(str(value or '').split())[:limit].strip()


def measure(text):
    # Multipacks retain the original size text, since a single numeric size would be misleading.
    matches = MEASURE.findall(text)
    if len(matches) != 1 or re.search(r'\d\s*[xх×*]\s*\d', text, re.I):
        return None
    value, unit = matches[0]
    normalized, factor = UNITS['fl oz' if re.fullmatch(r'fl\s*oz', unit, re.I) else unit.lower()]
    return [round(float(value.replace(',', '.')) * factor, 5), normalized]


def category(value):
    return next((key for key, pattern in CLASSIFIERS if pattern.search(value)), 14)


def add_extra(metadata, values):
    for key, value in zip(EXTRA, values):
        if value is not None and 0 <= value <= 100:
            metadata[key] = round(value, 5)


def off_product(row):
    code = clean(row.get('code'))
    name = clean(row.get('product_name'))
    if (not barcode_key(code) or not name or not re.search(r'[^\W\d_]', name)
            or row.get('no_nutrition_data') in ('on', '1', 'true')):
        return None
    energy = number(row.get('energy-kcal_100g'))
    kj = number(row.get('energy_100g'))
    if energy is None and kj is not None:
        energy = kj / 4.184
    values = [energy, *(number(row.get(key)) for key in
                          ('proteins_100g', 'fat_100g', 'carbohydrates_100g'))]
    if not valid_macros(values):
        return None
    tags = clean(row.get('categories_tags'), 3500)
    category_id = category(clean(row.get('main_category_en')) + ' ' + tags)
    package_text, serving_text = clean(row.get('quantity'), 100), clean(row.get('serving_size'), 100)
    package, serving = measure(package_text), measure(serving_text)
    units = {item[1] for item in (package, serving) if item and item[0] > 0}
    # The TSV names every column _100g, including products declared by volume.
    if len(units) > 1 or (not units and (category_id == 11 or re.search(r'en:(?:milks|soups|vegetable-oils)\b', tags))):
        return None
    meta = {}
    if units == {'ml'}:
        meta['basis'] = 'ml'
    for key, value in (
        ('manufacturer', clean(row.get('brand_owner'))),
        ('sourceCategory', clean(row.get('main_category_en'))),
        ('ingredients', clean(row.get('ingredients_text'), 2400)),
        ('packageText', package_text),
        ('allergens', clean(row.get('allergens_en'), 500)),
        ('created', clean(row.get('created_datetime'), 25)),
        ('updated', clean(row.get('last_modified_datetime'), 25)),
        ('countries', sorted({tag[3:] for tag in clean(row.get('countries_tags'), 800).split(',')
                              if re.fullmatch(r'en:[a-z][a-z-]+', tag) and tag not in ('en:world', 'en:null')})),
        ('aliases', list(dict.fromkeys(alias for alias in
                    (clean(row.get('generic_name')), clean(row.get('abbreviated_product_name'))) if alias and alias != name))),
        ('package', package if package and package[0] > 0 else None),
        ('serving', serving[0] if serving and serving[0] > 0 else None),
    ):
        if value:
            meta[key] = value
    add_extra(meta, [number(row.get(f'{key}_100g')) for key in ('sugars', 'fiber', 'saturated-fat', 'salt')])
    return [code, name, category_id, clean(row.get('brands')), *[round(n, 5) for n in values], meta]


def off_rows(path, counters):
    with gzip.open(path, 'rt', encoding='utf-8-sig', newline='') as stream:
        reader = csv.reader(stream, delimiter='\t')
        header = next(reader)
        indices = [(key, header.index(key)) for key in OFF_FIELDS]
        for cells in reader:
            counters['rows'] += 1
            if len(cells) != len(header):
                counters['malformed'] += 1
                continue
            row = {key: cells[index] for key, index in indices}
            product = off_product(row)
            if product is None:
                counters['qualityRejected'] += 1
                continue
            counters['qualityAccepted'] += 1
            countries = set(product[8].get('countries', []))
            tags = row['categories_tags']
            alcoholic = 'en:alcoholic-beverages' in tags
            group = ('kazakhstan' if 'kazakhstan' in countries else
                     'cis' if countries & CIS else
                     'sport' if product[2] == 13 else
                     'prepared' if re.search(r'en:(?:meals|ready-made-meals|frozen-meals)\b', tags)
                     else 'international')
            score = (0 if alcoholic else 1000) + (200 if POPULAR.search(product[3]) and not alcoholic else 0)
            score += min(150, int(number(row['unique_scans_n']) or 0))
            score += int(10 * min(1, number(row['completeness']) or 0))
            yield group, score, product


def usda_cells(archive, table):
    name = next(name for name in archive.namelist() if name.endswith(f'/{table}.csv'))
    with archive.open(name) as stream:
        yield from csv.reader(io.TextIOWrapper(stream, encoding='utf-8', newline=''))


def usda_rows(path, counters, limit):
    with zipfile.ZipFile(path) as archive:
        foods = usda_cells(archive, 'food')
        branded = usda_cells(archive, 'branded_food')
        # The current release tables have the same FDC order. Fail explicitly on a schema/order change.
        food_header, brand_header = next(foods), next(branded)
        fi, bi = food_header.index('fdc_id'), brand_header.index('fdc_id')
        name, pub = map(food_header.index, ('description', 'publication_date'))
        selected = {}
        for food, brand in zip(foods, branded, strict=True):
            if food[fi] != brand[bi]:
                raise ValueError('USDA tables differ in FDC row order')
            counters['rows'] += 1
            code = brand[4]
            key = barcode_key(code)
            if key is None or brand[16] or not food[name].strip():
                continue
            date = brand[13] or food[pub]
            previous = selected.get(key)
            if previous is None or (date, int(brand[bi])) > (previous[0], previous[1]):
                selected[key] = (date, int(brand[bi]), clean(food[name]), brand[1:4], code,
                                 brand[5], brand[7:9], brand[10], brand[12], brand[15])
        counters['uniqueBarcodes'] = len(selected)
        # Restrict the join to the most recent candidates plus room for records rejected by nutrition QC.
        candidates = {str(row[1]): row for row in sorted(selected.values(), reverse=True)[:limit * 2]}
        del selected
        nutrients = usda_cells(archive, 'food_nutrient')
        header = next(nutrients)
        fdc, nutrient, amount = map(header.index, ('fdc_id', 'nutrient_id', 'amount'))
        values = {}
        for row in nutrients:
            key = row[fdc]
            position = USDA_NUTRIENTS.get(row[nutrient])
            if position is not None and key in candidates:
                value = number(row[amount])
                if value is not None:
                    values.setdefault(key, [None] * 8)[position] = value
        for key, (date, fdc_id, name, brands, code, ingredients, serving, source_category, package, market) in candidates.items():
            nutrition = values.get(key, [])
            if not nutrition or not valid_macros(nutrition[:4]):
                counters['qualityRejected'] += 1
                continue
            category_id = category(source_category)
            country = re.sub(r'[^a-z]+', '-', market.lower()).strip('-')
            metadata = {'fdcId': fdc_id, 'updated': date, 'sourceCategory': clean(source_category)}
            for field, value in (
                ('manufacturer', clean(brands[0])), ('ingredients', clean(ingredients, 2400)),
                ('packageText', clean(package, 100)), ('package', measure(package)),
                ('countries', [country] if country else None),
                ('serving', number(serving[0]) if serving[1].lower() == 'g' else None),
                ('aliases', [clean(brands[2])] if brands[2] else None),
            ):
                if value:
                    metadata[field] = value
            sodium = nutrition[7]
            add_extra(metadata, [*nutrition[4:7], sodium * .0025 if sodium is not None else None])
            counters['qualityAccepted'] += 1
            yield 'usda', int(date.replace('-', '') or '0'), [
                code, name, category_id, clean(brands[1] or brands[0]),
                *[round(n, 5) for n in nutrition[:4]], metadata]


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()


def sanitize_optional_measurements(row):
    """Preserve the label text when a normalized measurement is outside app limits."""
    meta = row[8]
    serving = meta.get('serving')
    package = meta.get('package')
    if serving is not None and not 0 < serving <= 100000:
        del meta['serving']
    if package is not None and not 0 < package[0] <= 1000000:
        del meta['package']
    return row


