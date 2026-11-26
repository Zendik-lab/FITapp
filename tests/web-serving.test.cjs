/** @jest-environment node */
const { test, expect } = require('@jest/globals');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, sep } = require('node:path');
const { createStaticServer } = require('../scripts/serve-web.cjs');
const fetch = require('node:vm').runInThisContext('fetch');

test('явные маршруты получают оболочку, отсутствующие ресурсы и неизвестные пути — 404', async () => {
  const root = mkdtempSync(join(tmpdir(), 'masstracker-routes-'));
  writeFileSync(join(root, '_headers'), '/*\n  Cache-Control: no-cache\n');
  writeFileSync(
    join(root, '_redirects'),
    '/profile /index.html 200\n/profile/ /index.html 200\n',
  );
  writeFileSync(join(root, 'index.html'), '<html>app shell</html>');
  writeFileSync(join(root, '404.html'), '<html>Page not found</html>');
  const server = createStaticServer(root);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/', '/profile', '/profile/?source=home']) {
      const response = await fetch(origin + path);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<html>app shell</html>');
    }
    for (const path of [
      '/unknown-route',
      '/missing.js',
      '/missing.json',
      '/_expo/missing-chunk',
    ]) {
      const response = await fetch(origin + path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('app shell');
    }
  } finally {
    await new Promise((done) => server.close(done));
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
      throw new Error('Unsafe test cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});
