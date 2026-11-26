/** @jest-environment node */
const { beforeEach, afterEach, test, expect } = require('@jest/globals');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { generateServiceWorker } = require('../scripts/pwa-export.cjs');

let directory;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'masstracker-export-'));
  mkdirSync(join(directory, '_expo'));
  writeFileSync(
    join(directory, 'index.html'),
    '<html><link rel="stylesheet" href="/app.css"><script src="/_expo/main.js"></script></html>',
  );
  writeFileSync(
    join(directory, '_expo/main.js'),
    '/* final transformed bytes */',
  );
  writeFileSync(join(directory, '_expo/lazy-tab.js'), '/* unvisited tab */');
  writeFileSync(join(directory, '_expo/__runtime.js'), '/* Expo runtime */');
  writeFileSync(join(directory, 'app.css'), 'body { font-family: system-ui; }');
  writeFileSync(join(directory, 'local.woff2'), 'local font');
  writeFileSync(join(directory, 'image.svg'), '<svg/>');
  writeFileSync(join(directory, '_headers'), '/*\n Cache-Control: no-cache');
  writeFileSync(join(directory, 'metadata.json'), '{}');
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

test('хеширует готовый HTML, ленивые вкладки и локальные ресурсы, исключая служебные файлы', () => {
  const build = generateServiceWorker(directory);
  expect(build.resources.map(([url]) => url)).toEqual([
    '/',
    '/_expo/__runtime.js',
    '/_expo/lazy-tab.js',
    '/_expo/main.js',
    '/app.css',
    '/image.svg',
    '/local.woff2',
  ]);
  const hash = createHash('sha256')
    .update(readFileSync(join(directory, 'index.html')))
    .digest('base64');
  expect(build.resources[0]).toEqual(['/', `sha256-${hash}`]);
  expect(readFileSync(join(directory, 'sw.js'), 'utf8')).toContain(
    JSON.stringify(build),
  );
  expect(generateServiceWorker(directory).version).toBe(build.version);
  writeFileSync(
    join(directory, 'index.html'),
    '<html>new HTML<script src="/_expo/main.js"></script></html>',
  );
  expect(generateServiceWorker(directory).version).not.toBe(build.version);
});

test.each([
  ['<script src="/missing.js"></script>', /missing.js/],
  ['<script src="https://cdn.example.com/main.js"></script>', /external/i],
])(
  'отклоняет оболочку с недоступным критическим ресурсом: %s',
  (html, error) => {
    writeFileSync(join(directory, 'index.html'), html);
    expect(() => generateServiceWorker(directory)).toThrow(error);
  },
);

test('сохраняет URL ресурсов scoped-пакетов с @', () => {
  mkdirSync(join(directory, 'assets/@local'), { recursive: true });
  writeFileSync(join(directory, 'assets/@local/icon.svg'), '<svg/>');
  writeFileSync(
    join(directory, 'index.html'),
    '<html><img src="/assets/@local/icon.svg"><script src="/_expo/main.js"></script></html>',
  );
  expect(
    generateServiceWorker(directory).resources.map(([url]) => url),
  ).toContain('/assets/@local/icon.svg');
});

test('не запрашивает служебный HTML 404 через precache: Pages канонизирует HTML URL', () => {
  writeFileSync(join(directory, '404.html'), '<html>Not found</html>');
  expect(
    generateServiceWorker(directory).resources.map(([url]) => url),
  ).not.toContain('/404.html');
});

test('публикует согласованные идентификаторы HTML, worker и version.json', () => {
  const build = generateServiceWorker(directory, {
    buildId: '1234567890abcdef1234',
  });
  expect(build.version).toBe('1234567890abcdef1234');
  const version = JSON.parse(
    readFileSync(join(directory, 'version.json'), 'utf8'),
  );
  expect(version).toEqual({ buildId: build.version, appVersion: '0.1.0' });
  expect(readFileSync(join(directory, 'index.html'), 'utf8')).toContain(
    `<meta name="app-build" content="${build.version}">`,
  );
  expect(build.resources.some(([url]) => url === '/version.json')).toBe(false);
  expect(generateServiceWorker(directory).version).not.toBe(build.version);
});
