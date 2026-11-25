module.exports = function webAssetPaths(asset) {
  // Pages excludes node_modules directories even inside the web export.
  // Metro runs asset plugins before generating both JS references and output paths.
  // The export_path marker leaves Expo Go and the web development server unchanged.
  if (!asset.httpServerLocation.includes('?export_path=')) return asset;

  return {
    ...asset,
    httpServerLocation: asset.httpServerLocation.replace(
      /\/node_modules(?=\/)/g,
      '/vendor',
    ),
  };
};
