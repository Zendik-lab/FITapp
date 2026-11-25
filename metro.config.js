const { getDefaultConfig } = require('expo/metro-config');

const { addServiceWorker } = require('./scripts/pwa-export.cjs');

const config = getDefaultConfig(__dirname);
const serialize = config.serializer.customSerializer;

config.serializer.customSerializer = async (...args) => {
  const result = await serialize(...args);
  const [, , graph, options] = args;
  if (
    graph.transformOptions.platform === 'web' &&
    options.serializerOptions?.exporting &&
    !options.dev
  ) {
    return addServiceWorker(result, __dirname);
  }
  return result;
};

module.exports = config;
