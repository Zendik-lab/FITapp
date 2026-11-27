const { createHash } = require('node:crypto');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} = require('node:fs');
const { join } = require('node:path');

const indexFile = 'manifest.json';
const maxPagesAssetSize = 25 * 1024 * 1024;

function packageFiles(index) {
  if (index.schema !== 1 || !Array.isArray(index.packages))
    throw new Error('Invalid product catalog manifest');
  const paths = new Set();
  return index.packages.flatMap((pack) => {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(pack.id) || !Array.isArray(pack.files))
      throw new Error('Invalid product catalog package');
    return pack.files.map((file) => {
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        file.path !== `${pack.id}/${file.sha256}.json.gz` ||
        paths.has(file.path) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 1 ||
        file.bytes > maxPagesAssetSize
      )
        throw new Error('Invalid or duplicate product catalog chunk');
      paths.add(file.path);
      return file;
    });
  });
}

function copyCatalogAssets(source, destination) {
  if (!existsSync(join(source, indexFile))) return 0;
  const files = packageFiles(
    JSON.parse(readFileSync(join(source, indexFile), 'utf8')),
  );
  mkdirSync(destination, { recursive: true });
  for (const file of files) {
    mkdirSync(join(destination, file.path.split('/')[0]), { recursive: true });
    copyFileSync(join(source, file.path), join(destination, file.path));
  }
  copyFileSync(join(source, indexFile), join(destination, indexFile));
  return files.length;
}

async function verifyCatalogAssets(paths, load) {
  const prefix = '/catalog/';
  if (
    [...paths].some(
      (path) => path.startsWith(prefix) && path !== prefix + indexFile,
    )
  )
    throw new Error('Optional product catalog chunks must not be precached');
  if (!paths.has(prefix + indexFile)) return 0;
  const files = packageFiles(
    JSON.parse((await load(prefix + indexFile)).toString()),
  );
  if (paths.size + files.length > 20000)
    throw new Error('Catalog and PWA exceed Cloudflare Pages file limit');
  // Limit concurrency and avoid holding the complete catalog in memory.
  for (let offset = 0; offset < files.length; offset += 8) {
    await Promise.all(
      files.slice(offset, offset + 8).map(async (file) => {
        const bytes = await load(prefix + file.path);
        if (
          bytes.length !== file.bytes ||
          createHash('sha256').update(bytes).digest('hex') !== file.sha256
        )
          throw new Error(`Catalog integrity mismatch: ${file.path}`);
      }),
    );
  }
  return files.length;
}

module.exports = { copyCatalogAssets, verifyCatalogAssets };
