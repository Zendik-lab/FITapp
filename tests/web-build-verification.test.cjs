/** @jest-environment node */
const {
  test,
  expect,
  beforeEach,
  afterEach,
  jest: jestMock,
} = require('@jest/globals');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, sep } = require('node:path');
const { generateServiceWorker } = require('../scripts/pwa-export.cjs');
const { createStaticServer } = require('../scripts/serve-web.cjs');
const { verifyWebBuild } = require('../scripts/verify-web.cjs');

let root;
let build;
beforeEach(() => {
  jestMock
    .spyOn(globalThis, 'fetch')
    .mockImplementation(require('node:vm').runInThisContext('fetch'));
  root = mkdtempSync(join(tmpdir(), 'masstracker-verify-'));
  mkdirSync(join(root, '_expo'));
  writeFileSync(join(root, '_expo/main.js'), 'console.log("app");');
  writeFileSync(join(root, 'app.css'), 'body { color: black; }');
  writeFileSync(
    join(root, 'index.html'),
    '<html><head><link rel="stylesheet" href="/app.css"></head><script src="/_expo/main.js"></script></html>',
  );
  writeFileSync(join(root, '404.html'), '<html>Not found</html>');
  writeFileSync(
    join(root, 'manifest.webmanifest'),
    '{"id":"/","scope":"/","start_url":"/","display":"standalone","icons":[]}',
  );
  writeFileSync(join(root, '_headers'), readFileSync('public/_headers'));
  writeFileSync(
    join(root, '_redirects'),
    ['/nutrition', '/workouts', '/progress', '/profile']
      .flatMap((route) => [
        `${route} /index.html 200`,
        `${route}/ /index.html 200`,
      ])
      .join('\n'),
  );
  build = generateServiceWorker(root, { buildId: '1234567890abcdef1234' });
});
afterEach(() => {
  jestMock.restoreAllMocks();
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
    throw new Error('Unsafe test cleanup');
  rmSync(root, { recursive: true, force: true });
});

test('проверяет целостный локальный production-экспорт', async () => {
  await expect(verifyWebBuild(root)).resolves.toMatchObject({
    buildId: '1234567890abcdef1234',
    appVersion: '0.1.0',
    resources: build.resources.length,
  });
});

test.each([
  ['app.css', 'body { color: red; }', /app.css/],
  ['version.json', '<html>SPA fallback</html>', /version.json/],
  [
    'version.json',
    '{"buildId":"aaaaaaaaaaaaaaaaaaaa","appVersion":"0.1.0"}',
    /build|сборк/i,
  ],
  ['sw.js', '/* wrong worker */', /sw.js/],
])(
  'отклоняет смешанную или неполную сборку: %s',
  async (path, bytes, error) => {
    writeFileSync(join(root, path), bytes);
    await expect(verifyWebBuild(root)).rejects.toThrow(error);
  },
);

test('отклоняет экспорт с отсутствующим чанком или конфигурацией Pages', async () => {
  rmSync(join(root, '_expo/main.js'));
  await expect(verifyWebBuild(root)).rejects.toThrow(/main.js/);
  writeFileSync(join(root, '_expo/main.js'), 'console.log("app");');
  rmSync(join(root, '404.html'));
  await expect(verifyWebBuild(root)).rejects.toThrow(/404.html/);
});

test('отклоняет worker с правильными метаданными, но потерянным исполняемым кодом', async () => {
  const file = join(root, 'sw.js');
  writeFileSync(file, readFileSync(file, 'utf8').split(/\r?\n/)[0] + '\n');
  await expect(verifyWebBuild(root)).rejects.toThrow(/sw.js/);
});

test('проверяет реальные HTTP MIME, кеширование, маршруты и SHA-256 опубликованных байтов', async () => {
  let wrongMime = false;
  const server = createStaticServer(root, (request, response) => {
    if (wrongMime && request.url === '/_expo/main.js') {
      response
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end('console.log("app");');
      return true;
    }
    return false;
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await expect(verifyWebBuild(origin)).resolves.toMatchObject({
      buildId: '1234567890abcdef1234',
    });
    wrongMime = true;
    await expect(verifyWebBuild(origin)).rejects.toThrow(
      /MIME.*main.js|main.js.*MIME/,
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
});
