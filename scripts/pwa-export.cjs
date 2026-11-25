const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

function listPublicFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) return [];
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory()
      ? listPublicFiles(join(directory, entry.name), `${path}/`)
      : [path];
  });
}

function webAssetPath(asset, scale) {
  // Match Expo's web export convention for Metro's asset locations and scales.
  const directory = asset.httpServerLocation
    .replace(/^\/assets\?export_path=/, '')
    .replace(/^\/+/, '')
    .replace(/\.\.\//g, '_');
  return `${directory}/${asset.name}${scale === 1 ? '' : `@${scale}x`}.${asset.type}`;
}

function addServiceWorker(bundle, root) {
  const files = new Map();
  for (const { filename, type, source } of bundle.artifacts) {
    if (type !== 'map' && type !== 'css-external') files.set(filename, source);
  }
  for (const asset of bundle.assets) {
    asset.scales.forEach((scale, index) => {
      files.set(webAssetPath(asset, scale), readFileSync(asset.files[index]));
    });
  }
  const publicRoot = join(root, 'public');
  for (const path of listPublicFiles(publicRoot)) {
    files.set(path, readFileSync(join(publicRoot, path)));
  }

  const worker = readFileSync(join(root, 'scripts/service-worker.js'), 'utf8');
  const hash = createHash('sha256')
    .update(worker)
    .update(readFileSync(join(root, 'app.json')));
  const resources = [];
  for (const path of Array.from(files.keys()).sort()) {
    hash.update(path).update('\0').update(files.get(path)).update('\0');
    if (path !== 'index.html') {
      const url =
        '/' +
        path
          .split('/')
          .map((part) => encodeURIComponent(part).replaceAll('%40', '@'))
          .join('/');
      const checksum = createHash('sha256')
        .update(files.get(path))
        .digest('base64');
      resources.push([url, `sha256-${checksum}`]);
    }
  }

  const build = {
    version: hash.update(JSON.stringify(resources)).digest('hex').slice(0, 20),
    resources,
  };
  return {
    ...bundle,
    artifacts: [
      ...bundle.artifacts,
      {
        filename: 'sw.js',
        type: 'asset',
        source: worker.replace('/* @expo-build */ null', JSON.stringify(build)),
        metadata: {},
      },
    ],
  };
}

module.exports = { addServiceWorker };
