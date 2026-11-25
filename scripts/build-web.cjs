/* global __dirname */
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { generateServiceWorker } = require('./pwa-export.cjs');

const root = resolve(__dirname, '..');
const result = spawnSync(
  process.execPath,
  [require.resolve('expo/bin/cli'), 'export', '--platform', 'web'],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const build = generateServiceWorker(resolve(root, 'dist'));
console.log(
  `PWA ${build.version}: ${build.resources.length} resources (including HTML) verified for precache.`,
);
