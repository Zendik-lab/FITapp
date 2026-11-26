import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { FormDisabledContext, FormField } from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { CameraScanner } from './camera-scanner';
import { FoodForm } from './food-form';
import { useFoodDiary } from './food-context';
import { sameBarcode, validBarcode } from './domain';
import { offClient } from './off-api';
import { saveProduct } from './operations';
import type { FoodProduct } from './model';

export function ScannerScreen({
  onBack,
  onProduct,
  onCreate,
}: {
  onBack(): void;
  onProduct(p: FoodProduct): void;
  onCreate(code: string): void;
}) {
  const session = useFoodDiary();
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState(false);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [missing, setMissing] = useState(false);
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
  async function lookup(value: string) {
    if (guard.current) return;
    setCode(value);
    setMessage('');
    setMissing(false);
    setCamera(false);
    if (!validBarcode(value)) {
      setMessage('Некорректный штрихкод. Проверьте цифры и длину EAN/UPC.');
      return;
    }
    const local = session?.products.find((p) => sameBarcode(p.barcode, value));
    if (local) {
      onProduct(local);
      return;
    }
    if (!session) return;
    guard.current = true;
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const product = await offClient.barcode(value, controller.signal);
      if (controller.signal.aborted) return;
      if (product) {
        await session.change((s) => saveProduct(s, product));
        if (!controller.signal.aborted) onProduct(product);
      } else {
        setMissing(true);
        setMessage(
          'В Open Food Facts нет продукта с таким штрихкодом. Можно создать его по этикетке.',
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMissing(true);
        setMessage(describeError(error));
      }
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <FoodForm title="Штрихкод продукта" onBack={onBack}>
      <AppText tone="muted">
        EAN-13, EAN-8, UPC-A и UPC-E. Камера работает после вашего разрешения;
        ручной ввод доступен всегда.
      </AppText>
      {camera && active ? (
        <CameraScanner onCode={(value) => void lookup(value)} />
      ) : (
        <PrimaryButton
          secondary
          label="Открыть камеру"
          disabled={busy}
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
            setMissing(false);
            setMessage('');
          }}
        />
      </FormDisabledContext>
      <PrimaryButton
        label={busy ? 'Поиск продукта…' : 'Найти по штрихкоду'}
        disabled={busy || !code}
        onPress={() => void lookup(code.trim())}
      />
      {!!message && (
        <AppText accessibilityLiveRegion="polite">{message}</AppText>
      )}
      {missing && (
        <PrimaryButton
          secondary
          label="Создать с этим штрихкодом"
          onPress={() => onCreate(code)}
        />
      )}
    </FoodForm>
  );
}
