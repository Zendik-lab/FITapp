/* global __dirname */
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { cpSync, rmSync } = require('node:fs');
const { sep } = require('node:path');
const { version } = require('../package.json');
const { generateServiceWorker } = require('./pwa-export.cjs');
const { verifyWebBuild } = require('./verify-web.cjs');
const { copyCatalogAssets } = require('./catalog-assets.cjs');

const root = resolve(__dirname, '..');
const buildId = randomBytes(10).toString('hex');
const staging = resolve(root, '.expo', `web-build-${buildId}`);
const output = resolve(root, 'dist');
for (const path of [staging, output]) {
  if (!path.startsWith(root + sep)) throw new Error('Unsafe web output path');
}
const result = spawnSync(
  process.execPath,
  [
    require.resolve('expo/bin/cli'),
    'export',
    '--platform',
    'web',
    '--output-dir',
    staging,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      EXPO_PUBLIC_BUILD_ID: buildId,
    },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const catalogFiles = copyCatalogAssets(
  resolve(
    root,
    process.env.FITAPP_CATALOG_DIR ?? '.expo/catalog-05.2/published',
  ),
  resolve(staging, 'catalog'),
);
if (catalogFiles)
  console.log(`Included ${catalogFiles} optional product catalog chunks.`);
const build = generateServiceWorker(staging, {
  buildId,
});
console.log(
  `Production PWA ${version} (${buildId}): ${build.resources.length} resources (including HTML) verified for precache.`,
);
verifyWebBuild(staging)
  .then(
    async () => {
      // Metro can hold the dist directory open on Windows. Copy the already
      // verified export, then verify the actual deployment directory again.
      // Old immutable chunks may remain for older windows; they never enter the
      // new precache manifest, which is generated only from the empty staging dir.
      cpSync(staging, output, { recursive: true });
      await verifyWebBuild(output);
      rmSync(staging, { recursive: true, force: true });
      console.log(
        'Production PWA export integrity verified. Complete artifact: dist',
      );
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
