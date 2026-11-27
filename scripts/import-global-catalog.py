"""Build installable FITapp catalogs from official delimited product dumps."""
import argparse
import gzip
import hashlib
import json
import sqlite3
import time
import urllib.request
from collections import Counter
from itertools import islice
from pathlib import Path

from global_catalog_sources import (OFF_URL, USDA_URL, barcode_key, json_bytes,
                                    off_rows, sanitize_optional_measurements, usda_rows, valid_macros)

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {'off': ('off.tsv.gz', OFF_URL, 'ODbL-1.0'), 'usda': ('usda-branded.zip', USDA_URL, 'CC0-1.0')}
CORE = {'kazakhstan': 180, 'cis': 180, 'international': 40}
PACKS = [
    ('kazakhstan', 'Казахстан', 'off', 'kazakhstan', 10_000),
    ('cis', 'СНГ и соседние страны', 'off', 'cis', 40_000),
    ('sports', 'Спортивное питание', 'off', 'sport', 10_000),
    ('prepared', 'Готовая еда', 'off', 'prepared', 20_000),
    ('international', 'Международные продукты', 'off', 'international', 100_000),
    ('international-extended', 'Международные продукты, часть 2', 'off', 'international', 100_000),
    ('usda-branded', 'Товары USDA FoodData Central', 'usda', 'usda', 100_000),
]
CHUNK_SIZE = 500


def file_hash(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def download(destination, url):
    temporary = destination.with_suffix(destination.suffix + '.download')
    with urllib.request.urlopen(url, timeout=90) as response, temporary.open('wb') as output:
        while data := response.read(1024 * 1024):
            output.write(data)
    temporary.replace(destination)


def prepare(cache, source, get_missing):
    start = time.perf_counter()
    file, url, license_id = SOURCES[source]
    path = cache / file
    if not path.exists() and get_missing:
        download(path, url)
    if not path.is_file():
        raise SystemExit(f'Missing {path}. Use --download or supply the official export.')
    digest = file_hash(path)
    database_path = cache / f'{source}-staging.sqlite'
    partial = cache / f'{source}-staging.partial.sqlite'
    partial.unlink(missing_ok=True)
    counters = Counter()
    rows = off_rows(path, counters) if source == 'off' else usda_rows(path, counters, 100_000)
    database = sqlite3.connect(partial)
    try:
        database.executescript("""
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            CREATE TABLE products (code TEXT PRIMARY KEY, section TEXT, score INTEGER, row TEXT);
            CREATE TABLE source (metadata TEXT);
        """)
        statement = """INSERT INTO products VALUES (?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET section=excluded.section, score=excluded.score, row=excluded.row
            WHERE excluded.score > products.score
                OR (excluded.score = products.score AND excluded.row < products.row)"""
        values = ((barcode_key(row[0]), group, score, json_bytes(row).decode())
                  for group, score, row in rows)
        while batch := list(islice(values, 10_000)):
            database.executemany(statement, batch)
            database.commit()
            if counters['qualityAccepted'] % 100_000 == 0:
                print(f'{source}: {counters.most_common()}', flush=True)
        database.execute('CREATE INDEX section_score ON products(section, score DESC, code)')
        counters['uniqueQualityAccepted'] = database.execute('SELECT count(*) FROM products').fetchone()[0]
        database.execute('INSERT INTO source VALUES (?)', (json.dumps({
            'url': url, 'license': license_id, 'sha256': digest, 'bytes': path.stat().st_size,
            'counters': dict(counters),
            'seconds': round(time.perf_counter() - start, 2),
        }),))
        database.commit()
    finally:
        database.close()
    partial.replace(database_path)
    print(f'{source}: {dict(counters)} in {time.perf_counter() - start:.2f}s', flush=True)


def select(database, section, count, offset=0):
    return database.execute(
        'SELECT code, row FROM products WHERE section=? ORDER BY score DESC, code LIMIT ? OFFSET ?',
        (section, count, offset))


def assemble_packages(cache, output, sources):
    start = time.perf_counter()
    output.mkdir(parents=True, exist_ok=True)
    databases = {}
    for source in sources:
        path = cache / f'{source}-staging.sqlite'
        if not path.exists():
            raise SystemExit(f'Run prepare for {source} first.')
        databases[source] = sqlite3.connect(path)
    packages = []
    statistics = {}
    distinct_codes = set()
    brands = set()
    categories = Counter()
    all_kazakhstan = 0

    def track(code, data):
        nonlocal all_kazakhstan
        distinct_codes.add(code)
        if data[3]:
            brands.add(data[3].casefold())
        if 'kazakhstan' in data[8].get('countries', []):
            all_kazakhstan += 1
        categories[data[2]] += 1

    core = []
    offsets = Counter()
    if off := databases.get('off'):
        for group, count in CORE.items():
            for code, row in select(off, group, count):
                data = sanitize_optional_measurements(json.loads(row))
                track(code, data)
                offsets[group] += 1
                core.append(data)
        (ROOT / 'src/features/food/catalog-core-data.ts').write_text(
            '// Generated by scripts/import-global-catalog.py. Open Food Facts · ODbL 1.0.\n'
            "import type { PackedProduct } from '../catalog/catalog-format';\n\n"
            '// prettier-ignore\n'
            'export const catalogCore: readonly PackedProduct[] = [\n'
            + ''.join('  ' + json_bytes(row).decode() + ',\n' for row in core) + '];\n',
            encoding='utf-8', newline='\n')
    for id, name, source, group, limit in PACKS:
        if source not in databases:
            continue
        files = []
        size = unpacked = count = 0
        current = select(databases[source], group, -1 if source == 'usda' else limit, offsets[group])
        if source == 'usda':
            # Publish disjoint catalogs without merging fields across licenses.
            current = islice(((code, row) for code, row in current if code not in distinct_codes), limit)
        while batch := list(islice(current, CHUNK_SIZE)):
            data = []
            for code, row in batch:
                item = sanitize_optional_measurements(json.loads(row))
                track(code, item)
                data.append(item)
            raw = json_bytes(data)
            packed = gzip.compress(raw, compresslevel=6, mtime=0)
            sha = hashlib.sha256(packed).hexdigest()
            path = f'{id}/{sha}.json.gz'
            target = output / path
            target.parent.mkdir(exist_ok=True)
            if not target.exists() or file_hash(target) != sha:
                target.write_bytes(packed)
            size += len(packed)
            unpacked += len(raw)
            count += len(batch)
            files.append(dict(path=path, bytes=len(packed), rawBytes=len(raw), count=len(batch), sha256=sha))
        offsets[group] += count
        if not count:
            continue
        url, license_id = SOURCES[source][1:]
        version = hashlib.sha256(''.join(f['sha256'] for f in files).encode()).hexdigest()[:24]
        packages.append(dict(id=id, title=name, source=source, sourceUrl=url, license=license_id,
                             version=version, count=count, bytes=size, rawBytes=unpacked, files=files))
        statistics[id] = dict(count=count, bytes=size, rawBytes=unpacked, files=len(files))
    manifest = json_bytes(dict(schema=1, packages=packages))
    temporary = output / 'manifest.json.new'
    temporary.write_bytes(manifest)
    temporary.replace(output / 'manifest.json')
    report = dict(
        source={source: json.loads(db.execute('SELECT metadata FROM source').fetchone()[0])
                for source, db in databases.items()},
        builtInProducts=len(core), builtInBytes=len(json_bytes(core)),
        distinctBarcodes=len(distinct_codes), brands=len(brands), kazakhstanProducts=all_kazakhstan,
        packages=statistics, categoryCounts=dict(sorted(categories.items())),
        totalRows=len(core) + sum(pack['count'] for pack in packages),
        manifestBytes=len(manifest), seconds=round(time.perf_counter() - start, 2),
    )
    (cache / 'product-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n',
                                                encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


def audit(cache, output):
    metrics = json.loads((cache / 'product-report.json').read_bytes())
    keys = set()

    def inspect(row):
        code, name, category, _, *rest = row
        key = barcode_key(code)
        if not key or key in keys or not name.strip() or not 0 <= category < 17 or not valid_macros(rest[:4]):
            raise ValueError(f'Bad or duplicate catalog entry: {code}')
        metadata = rest[4]
        if not 0 < metadata.get('serving', 1) <= 100000 or not 0 < metadata.get('package', [1])[0] <= 1000000:
            raise ValueError(f'Invalid catalog measurement: {code}')
        keys.add(key)

    if metrics['builtInProducts']:
        core = ROOT / 'src/features/food/catalog-core-data.ts'
        for line in core.read_text(encoding='utf-8').splitlines():
            if line.startswith('  ['):
                inspect(json.loads(line.strip().removesuffix(',')))
        if len(keys) != metrics['builtInProducts']:
            raise ValueError('Built-in product count mismatch')
    manifest = json.loads((output / 'manifest.json').read_bytes())
    chunks = 0
    for pack in manifest['packages']:
        count = 0
        for file in pack['files']:
            path = output / file['path']
            data = path.read_bytes()
            if len(data) != file['bytes'] or hashlib.sha256(data).hexdigest() != file['sha256']:
                raise ValueError(f'Invalid checksum: {path}')
            raw = gzip.decompress(data)
            rows = json.loads(raw)
            if len(raw) != file['rawBytes'] or len(rows) != file['count']:
                raise ValueError(f'Invalid size or count: {path}')
            for row in rows:
                inspect(row)
            chunks += 1
            count += len(rows)
        if count != pack['count']:
            raise ValueError(f'Invalid package count: {pack["id"]}')
    if len(keys) != metrics['distinctBarcodes']:
        raise ValueError('Catalog report count mismatch')
    print(f'{len(keys):,} unique GTINs verified, {chunks} compressed product chunks verified.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.expo/catalog-05.2')
    actions = parser.add_subparsers(dest='action', required=True)
    ingest = actions.add_parser('prepare')
    ingest.add_argument('source', choices=SOURCES)
    ingest.add_argument('--download', action='store_true')
    assemble = actions.add_parser('pack')
    assemble.add_argument('--out', type=Path)
    assemble.add_argument('--sources', nargs='+', choices=SOURCES, default=list(SOURCES))
    inspect = actions.add_parser('audit')
    inspect.add_argument('--out', type=Path)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    if args.action == 'prepare':
        prepare(args.cache, args.source, args.download)
    elif args.action == 'pack':
        assemble_packages(args.cache, args.out or args.cache / 'published', args.sources)
    else:
        audit(args.cache, args.out or args.cache / 'published')


if __name__ == '__main__':
    main()
