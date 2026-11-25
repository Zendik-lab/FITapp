const { expect, test } = require('@jest/globals');

const config = require('../metro.config');

async function transformPath(httpServerLocation) {
  let asset = { httpServerLocation };
  for (const plugin of config.transformer.assetPlugins) {
    asset = await require(plugin)(asset);
  }
  return asset.httpServerLocation;
}

test('экспортирует ресурсы зависимостей вне исключаемого Pages каталога node_modules', async () => {
  expect(
    await transformPath(
      '/assets?export_path=/assets/node_modules/expo-router/assets',
    ),
  ).toBe('/assets?export_path=/assets/vendor/expo-router/assets');
});

test.each([
  '/assets/node_modules/expo-router/assets',
  '/assets/?unstable_path=./node_modules/expo-router/assets',
  '/assets?export_path=/assets/images',
])('сохраняет нативные, dev и пользовательские пути: %s', async (path) => {
  expect(await transformPath(path)).toBe(path);
});
