import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';

export interface CameraScannerProps {
  onCode(code: string): void;
}
export function CameraScanner({ onCode }: CameraScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [failure, setFailure] = useState('');
  const scanned = useRef(false);
  if (!permission?.granted)
    return (
      <>
        <AppText>
          Для сканирования нужен доступ к камере. Можно ввести штрихкод вручную.
        </AppText>
        {permission?.canAskAgain !== false && (
          <PrimaryButton
            label="Разрешить камеру"
            onPress={() => {
              void requestPermission().catch(() =>
                setFailure(
                  'Не удалось открыть камеру. Используйте ручной ввод.',
                ),
              );
            }}
          />
        )}
        {permission?.canAskAgain === false && (
          <AppText>Доступ к камере отключён в настройках устройства.</AppText>
        )}
        {!!failure && (
          <AppText tone="error" accessibilityRole="alert">
            {failure}
          </AppText>
        )}
      </>
    );
  return (
    <>
      <CameraView
        style={{ height: 240, width: '100%' }}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
        }}
        onMountError={() =>
          setFailure('Камера недоступна. Введите код вручную.')
        }
        onBarcodeScanned={(result) => {
          if (!scanned.current) {
            scanned.current = true;
            onCode(result.data);
          }
        }}
      />
      {!!failure && (
        <AppText tone="error" accessibilityRole="alert">
          {failure}
        </AppText>
      )}
    </>
  );
}
