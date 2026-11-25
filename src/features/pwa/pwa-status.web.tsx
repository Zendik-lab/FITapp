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
import {
  observeOfflineSupport,
  type OfflinePreparation,
} from './offline-support';

const PwaContext = createContext<{
  offline: boolean;
  ready: boolean;
  preparation: OfflinePreparation;
  prepareOffline: () => void;
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
  const [preparation, setPreparation] =
    useState<OfflinePreparation>('unavailable');
  const prepareOffline = useRef<() => void>(() => {});
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

    const support = observeOfflineSupport(setPreparation, setUpdate);
    prepareOffline.current = support.prepare;
    return () => {
      prepareOffline.current = () => {};
      support.dispose();
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
        ready: preparation === 'ready',
        preparation,
        prepareOffline: () => prepareOffline.current(),
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

export function PwaNotices({
  blockUpdate = false,
}: { blockUpdate?: boolean } = {}) {
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
            disabled={pwa.updating || blockUpdate}
            onPress={() => void pwa.applyUpdate()}
            secondary
          />
          {blockUpdate && (
            <AppText tone="muted">
              Сохраните изменения перед обновлением.
            </AppText>
          )}
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
        <AppText variant="caption" tone="muted" accessibilityRole="status">
          Доступно без интернета
        </AppText>
      )}
      {pwa &&
        !pwa.ready &&
        !__DEV__ &&
        window.isSecureContext &&
        'serviceWorker' in navigator && (
          <>
            <AppText
              variant="caption"
              tone="muted"
              accessibilityRole="status"
              accessibilityLiveRegion="polite"
            >
              {pwa.preparation === 'preparing'
                ? 'Готовим офлайн-режим…'
                : 'Офлайн-режим ещё не готов. Подключитесь к интернету и повторите подготовку.'}
            </AppText>
            {pwa.preparation === 'unavailable' && (
              <PrimaryButton
                label="Подготовить офлайн-режим"
                secondary
                disabled={pwa.offline}
                onPress={pwa.prepareOffline}
              />
            )}
          </>
        )}
    </Card>
  );
}
