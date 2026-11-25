import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { SectionHeader } from '@/components/headers';
import { useAppTheme } from '@/theme';

import { activateUpdate } from './web-update';

const PwaContext = createContext<{
  offline: boolean;
  ready: boolean;
  updateAvailable: boolean;
  updating: boolean;
  updateError?: string;
  applyUpdate: () => Promise<void>;
} | null>(null);

function subscribeToConnection(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function subscribeToDisplayMode(onChange: () => void) {
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function isStandalone() {
  const safari = navigator as Navigator & { standalone?: boolean };
  return (
    safari.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function useStandalone() {
  return useSyncExternalStore(
    subscribeToDisplayMode,
    isStandalone,
    () => false,
  );
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const offline = useSyncExternalStore(
    subscribeToConnection,
    () => !navigator.onLine,
    () => false,
  );
  const standalone = useStandalone();
  const [ready, setReady] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const [updateError, setUpdateError] = useState<string>();
  const [updating, setUpdating] = useState(false);
  const activeUpdate = useRef(false);
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = isDark ? 'dark' : 'light';
    root.style.setProperty('--app-background', colors.background);
    root.style.setProperty('--focus-ring', colors.accentText);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', colors.background);
  }, [colors, isDark]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const resize = () => {
      const field = document.activeElement?.matches(
        'input, textarea, [contenteditable="true"]',
      );
      if (field && viewport.scale === 1) {
        root.style.setProperty(
          '--visual-viewport-height',
          `${viewport.height}px`,
        );
      } else {
        root.style.removeProperty('--visual-viewport-height');
      }
    };
    viewport.addEventListener('resize', resize);
    document.addEventListener('focusin', resize);
    document.addEventListener('focusout', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      document.removeEventListener('focusin', resize);
      document.removeEventListener('focusout', resize);
      root.style.removeProperty('--visual-viewport-height');
    };
  }, []);

  useEffect(() => {
    if (standalone && navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => {
        // IndexedDB remains available with the browser's normal eviction policy.
      });
    }
  }, [standalone]);

  useEffect(() => {
    if (__DEV__ || !window.isSecureContext || !('serviceWorker' in navigator))
      return;

    const workers = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    let mounted = true;

    function sync() {
      setReady(Boolean(workers.controller));
      setUpdate(workers.controller ? (registration?.waiting ?? null) : null);
    }

    function watchInstall() {
      installing?.removeEventListener('statechange', sync);
      installing = registration?.installing ?? null;
      installing?.addEventListener('statechange', sync);
      sync();
    }

    function checkForUpdate() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void registration?.update().catch(() => {
          // Connectivity can change between the browser event and the request.
        });
      }
    }

    workers.addEventListener('controllerchange', sync);
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    const checks = setInterval(checkForUpdate, 60 * 60 * 1000);
    void workers
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(
        (result) => {
          if (!mounted) return;
          registration = result;
          registration.addEventListener('updatefound', watchInstall);
          watchInstall();
        },
        (error: unknown) => {
          if (mounted && navigator.onLine && !workers.controller) {
            console.warn(
              '[MassTracker] Не удалось подготовить офлайн-режим',
              error,
            );
          }
        },
      );
    sync();

    return () => {
      mounted = false;
      clearInterval(checks);
      installing?.removeEventListener('statechange', sync);
      registration?.removeEventListener('updatefound', watchInstall);
      workers.removeEventListener('controllerchange', sync);
      document.removeEventListener('visibilitychange', checkForUpdate);
      window.removeEventListener('online', checkForUpdate);
    };
  }, []);

  async function applyUpdate() {
    if (!update || activeUpdate.current) return;
    activeUpdate.current = true;
    setUpdating(true);
    setUpdateError(undefined);
    try {
      await activateUpdate(update);
    } catch (failure) {
      activeUpdate.current = false;
      setUpdating(false);
      setUpdateError(
        failure instanceof Error
          ? failure.message
          : 'Не удалось обновить приложение.',
      );
    }
  }

  return (
    <PwaContext
      value={{
        offline,
        ready,
        updateAvailable: Boolean(update),
        updating,
        updateError,
        applyUpdate,
      }}
    >
      {children}
    </PwaContext>
  );
}

export function PwaNotices() {
  const pwa = use(PwaContext);
  if (!pwa) return null;

  return (
    <>
      {pwa.offline && (
        <AppText
          variant="caption"
          tone="muted"
          accessibilityRole="status"
          accessibilityLiveRegion="polite"
        >
          Офлайн
        </AppText>
      )}
      {(pwa.updateAvailable || pwa.updating) && (
        <Card>
          <AppText accessibilityRole="status">Доступна новая версия</AppText>
          <PrimaryButton
            label={pwa.updating ? 'Обновление…' : 'Обновить'}
            disabled={pwa.updating}
            onPress={() => void pwa.applyUpdate()}
            secondary
          />
          {pwa.updateError && (
            <AppText tone="error" accessibilityRole="alert">
              {pwa.updateError}
            </AppText>
          )}
        </Card>
      )}
    </>
  );
}

export function InstallAppSection() {
  const pwa = use(PwaContext);
  const standalone = useStandalone();

  return (
    <Card>
      <SectionHeader title="Установка приложения" />
      {standalone ? (
        <AppText tone="muted">Приложение открыто с экрана «Домой».</AppText>
      ) : (
        <>
          <AppText>1. Откройте MassTracker в Safari на iPhone.</AppText>
          <AppText>2. Нажмите «Поделиться».</AppText>
          <AppText>3. Выберите «На экран Домой».</AppText>
          <AppText>
            4. Включите «Открывать как веб-приложение», если этот переключатель
            доступен, и нажмите «Добавить».
          </AppText>
        </>
      )}
      {pwa?.ready && (
        <AppText variant="caption" tone="muted">
          Доступно без интернета
        </AppText>
      )}
    </Card>
  );
}
