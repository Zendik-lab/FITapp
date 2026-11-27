import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import {
  ChoiceGroup,
  FormDisabledContext,
  FormField,
} from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { findCatalogBarcode } from '@/features/catalog/catalog-service';
import { lookupBarcode } from './barcode-lookup';
import { CameraScanner } from './camera-scanner';
import { builtinFoods } from './catalog';
import { FoodForm } from './food-form';
import { useFoodDiary } from './food-context';
import { normalizeScannedBarcode } from './domain';
import { offClient } from './off-api';
import type { FoodProduct } from './model';

export function ScannerScreen({
  onBack,
  onProduct,
  onCreate,
}: {
  onBack(): void;
  onProduct(p: FoodProduct, offlineSaved: boolean): void;
  onCreate(code: string): void;
}) {
  const session = useFoodDiary();
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState(false);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [missing, setMissing] = useState(false);
  const [shortFormat, setShortFormat] = useState<'ean8' | 'upc_e'>('ean8');
  const ambiguous =
    normalizeScannedBarcode(code, 'ean8') &&
    normalizeScannedBarcode(code, 'upc_e');
  const request = useRef<AbortController | null>(null);
  const guard = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => {
        setActive(false);
        setCamera(false);
        request.current?.abort();
      };
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setCamera(false);
    });
    return () => {
      sub.remove();
      request.current?.abort();
    };
  }, []);
  async function lookup(value: string, format?: 'ean8' | 'upc_e') {
    if (guard.current) return;
    const normalized = normalizeScannedBarcode(value, format);
    setCode(normalized ?? value.trim());
    setMessage('');
    setMissing(false);
    setCamera(false);
    if (!normalized) {
      setMessage('Некорректный штрихкод. Проверьте длину и контрольную цифру.');
      return;
    }
    if (!session || session.loading) return;
    guard.current = true;
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    const online = Platform.OS !== 'web' || navigator.onLine !== false;
    try {
      const result = await lookupBarcode(normalized, {
        builtins: builtinFoods,
        session,
        online,
        signal: controller.signal,
        findPack: findCatalogBarcode,
        remote: offClient.barcode,
      });
      if (controller.signal.aborted) return;
      if (result) {
        onProduct(result.product, result.saved);
      } else {
        setMissing(true);
        setMessage(
          online
            ? 'Товар с этим штрихкодом не найден в каталогах и Open Food Facts.'
            : 'Товар с этим штрихкодом не найден офлайн. Онлайн-поиск доступен при подключении.',
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMissing(true);
        setMessage(describeError(error));
      }
    } finally {
      request.current = null;
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <FoodForm title="Штрихкод продукта" onBack={onBack}>
      <AppText tone="muted">
        EAN-13, EAN-8, UPC-A, UPC-E и GTIN-14. Штрихкод можно считать камерой
        или ввести вручную.
      </AppText>
      {camera && active ? (
        <>
          <CameraScanner onCode={(value) => void lookup(value)} />
          <PrimaryButton
            secondary
            label="Закрыть камеру"
            onPress={() => setCamera(false)}
          />
        </>
      ) : (
        <PrimaryButton
          secondary
          label="Открыть камеру"
          disabled={busy || session?.loading}
          onPress={() => setCamera(true)}
        />
      )}
      <FormDisabledContext value={busy}>
        <FormField
          name="manual-barcode"
          label="Штрихкод"
          inputMode="numeric"
          value={code}
          onChangeText={(v) => {
            setCode(v);
            setShortFormat('ean8');
            setMissing(false);
            setMessage('');
          }}
        />
        {!!ambiguous && (
          <ChoiceGroup
            label="Формат штрихкода"
            value={shortFormat}
            onChange={setShortFormat}
            options={[
              { value: 'ean8', label: 'EAN-8' },
              { value: 'upc_e', label: 'UPC-E' },
            ]}
          />
        )}
      </FormDisabledContext>
      <PrimaryButton
        label={busy ? 'Поиск продукта…' : 'Найти по штрихкоду'}
        disabled={busy || session?.loading || !code}
        onPress={() => void lookup(code, ambiguous ? shortFormat : undefined)}
      />
      {!!message && (
        <AppText accessibilityLiveRegion="polite">{message}</AppText>
      )}
      {missing && (
        <>
          <PrimaryButton secondary label="Найти по названию" onPress={onBack} />
          <PrimaryButton
            secondary
            label="Создать с этим штрихкодом"
            onPress={() => onCreate(code)}
          />
        </>
      )}
    </FoodForm>
  );
}
