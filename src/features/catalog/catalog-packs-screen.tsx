import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Dialog } from '@/components/dialog';
import { describeError } from '@/database/storage-diagnostics';
import { FoodForm } from '@/features/food/food-form';
import { useOfflineStatus } from '@/features/pwa/pwa-status';
import { formatNumber } from '@/features/calendar/calendar';
import type { CatalogPack } from './catalog-format';
import type { CatalogState } from './catalog-storage-contract';
import {
  installCatalogPack,
  installedCatalogs,
  loadCatalogManifest,
  removeCatalogPack,
} from './catalog-service';

const packageNames: Record<string, string> = {
  kazakhstan: 'Казахстан',
  cis: 'СНГ и соседние страны',
  sports: 'Спортивное питание',
  prepared: 'Готовая еда',
  international: 'Международные продукты',
  'international-extended': 'Международные продукты, часть 2',
  'usda-branded': 'Товары USDA FoodData Central',
};
function formatSize(bytes: number) {
  return bytes >= 1024 ** 2
    ? `${formatNumber(bytes / 1024 ** 2)} МБ`
    : `${formatNumber(bytes / 1024)} КБ`;
}

export function CatalogPacksScreen({ onBack }: { onBack(): void }) {
  const offline = useOfflineStatus();
  const [packs, setPacks] = useState<CatalogPack[]>([]);
  const [states, setStates] = useState<CatalogState[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<{ id: string; count: number }>();
  const [confirm, setConfirm] = useState<CatalogState>();
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0);
  const installation = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      installedCatalogs(),
      loadCatalogManifest(controller.signal),
    ]).then(([storage, manifest]) => {
      if (controller.signal.aborted) return;
      if (storage.status === 'fulfilled') setStates(storage.value);
      if (manifest.status === 'fulfilled') setPacks(manifest.value);
      setFailure(
        [
          storage.status === 'rejected' ? describeError(storage.reason) : '',
          manifest.status === 'rejected' ? describeError(manifest.reason) : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      setLoading(false);
    });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => () => installation.current?.abort(), []);

  async function install(pack: CatalogPack) {
    if (installation.current) return;
    const controller = new AbortController();
    installation.current = controller;
    setFailure('');
    setMessage('');
    setInstalling({ id: pack.id, count: 0 });
    try {
      await installCatalogPack(
        pack,
        (count) => setInstalling({ id: pack.id, count }),
        controller.signal,
      );
      setMessage(
        controller.signal.aborted
          ? 'Загрузка приостановлена. Сохранённые части можно продолжить.'
          : `«${pack.title}» доступен без интернета.`,
      );
    } catch (error) {
      if (controller.signal.aborted)
        setMessage(
          'Загрузка приостановлена. Сохранённые части можно продолжить.',
        );
      else setFailure(describeError(error));
    } finally {
      try {
        setStates(await installedCatalogs());
      } catch (error) {
        setFailure(describeError(error));
      }
      installation.current = null;
      setInstalling(undefined);
    }
  }

  async function remove(id: string) {
    setConfirm(undefined);
    setFailure('');
    setMessage('');
    try {
      await removeCatalogPack(id);
      setStates(await installedCatalogs());
      setMessage('Пакет удалён.');
    } catch (error) {
      setFailure(describeError(error));
    }
  }

  const rows = new Map(
    packs.map((pack) => [
      pack.id,
      { pack, state: states.find((state) => state.id === pack.id) },
    ]),
  );
  return (
    <FoodForm title="Офлайн-каталоги" onBack={onBack} error={failure}>
      <AppText tone="muted">
        Скачайте нужные пакеты для поиска продуктов по названию и штрихкоду без
        интернета.
      </AppText>
      {loading && (
        <ActivityIndicator accessibilityLabel="Загрузка списка пакетов" />
      )}
      {!!message && (
        <AppText accessibilityRole="status" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      )}
      {failure && !installing && !loading ? (
        <PrimaryButton
          secondary
          label="Обновить список пакетов"
          onPress={() => {
            setLoading(true);
            setRetry(retry + 1);
          }}
        />
      ) : null}
      {!loading && !rows.size && !states.length && !failure && (
        <AppText tone="muted">
          В этой сборке есть встроенный каталог. Дополнительные пакеты
          недоступны.
        </AppText>
      )}
      {offline && (
        <AppText tone="muted">Для скачивания подключитесь к интернету.</AppText>
      )}
      {[...rows.values()].map(({ pack, state }) => {
        const current = state?.installedVersion === pack.version;
        const paused = state?.pending?.version === pack.version;
        const progress =
          installing?.id === pack.id ? installing.count : undefined;
        const saved = pack.files
          .slice(0, state?.pending?.next ?? 0)
          .reduce((sum, file) => sum + file.count, 0);
        return (
          <Card key={pack.id}>
            <AppText variant="section">{pack.title}</AppText>
            <AppText tone="muted">
              {new Intl.NumberFormat('ru').format(pack.count)} продуктов ·{' '}
              {formatSize(pack.bytes)} · {pack.license}
            </AppText>
            {progress !== undefined ? (
              <>
                <AppText
                  accessibilityRole="progressbar"
                  accessibilityLabel={`Загрузка «${pack.title}»`}
                  accessibilityValue={{
                    min: 0,
                    max: pack.count,
                    now: progress,
                  }}
                  accessibilityLiveRegion="polite"
                >
                  {Math.round((progress / pack.count) * 100)}% · {progress} из{' '}
                  {pack.count}
                </AppText>
                <PrimaryButton
                  secondary
                  label="Приостановить"
                  onPress={() => installation.current?.abort()}
                />
              </>
            ) : (
              <>
                {state?.installed && (
                  <AppText tone="muted">Доступен без интернета</AppText>
                )}
                {paused && saved > 0 && (
                  <AppText tone="muted">
                    Сохранено {saved} из {pack.count}
                  </AppText>
                )}
                {!current && (
                  <PrimaryButton
                    secondary
                    label={
                      paused
                        ? 'Продолжить загрузку'
                        : state?.installed
                          ? 'Обновить пакет'
                          : 'Скачать пакет'
                    }
                    disabled={!!installing || offline}
                    onPress={() => void install(pack)}
                  />
                )}
                {!!state && !!(state.installed || state.pending) && (
                  <PrimaryButton
                    secondary
                    label="Удалить пакет"
                    disabled={!!installing}
                    onPress={() => setConfirm(state)}
                  />
                )}
              </>
            )}
          </Card>
        );
      })}
      {states
        .filter(
          ({ id, installed, pending }) =>
            !rows.has(id) && (installed || pending),
        )
        .map((state) => (
          <Card key={state.id}>
            <AppText variant="section">
              {packageNames[state.id] ?? state.id}
            </AppText>
            <AppText tone="muted">
              {state.installed
                ? 'Доступен без интернета'
                : 'Загрузка приостановлена'}
            </AppText>
            <PrimaryButton
              secondary
              label="Удалить пакет"
              disabled={!!installing}
              onPress={() => setConfirm(state)}
            />
          </Card>
        ))}
      <Dialog
        open={!!confirm}
        title="Удалить офлайн-пакет?"
        onDismiss={() => setConfirm(undefined)}
      >
        <AppText>
          Удалённый пакет можно скачать снова. Записи дневника и сохранённые
          продукты доступны отдельно.
        </AppText>
        <PrimaryButton
          secondary
          label="Отмена"
          onPress={() => setConfirm(undefined)}
        />
        <PrimaryButton
          label="Подтвердить удаление пакета"
          onPress={() => confirm && void remove(confirm.id)}
        />
      </Dialog>
    </FoodForm>
  );
}
