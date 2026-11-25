import { version } from '../../../package.json';

export type BuildInfo = { buildId: string; appVersion: string };

export function currentBuild(): BuildInfo {
  const meta = (name: string) =>
    typeof document === 'undefined'
      ? undefined
      : document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
          ?.content;
  return {
    buildId: meta('app-build') ?? 'development',
    appVersion: meta('app-version') ?? version,
  };
}

export function isBuildInfo(value: unknown): value is BuildInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buildId' in value &&
    typeof value.buildId === 'string' &&
    /^[a-f0-9]{20}$/.test(value.buildId) &&
    'appVersion' in value &&
    typeof value.appVersion === 'string'
  );
}
