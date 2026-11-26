import { useEffect, useRef, useState } from 'react';
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { AppText } from '@/components/app-text';
import type { CameraScannerProps } from './camera-scanner';

export function CameraScanner({ onCode }: CameraScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onCode);
  useEffect(() => {
    callback.current = onCode;
  }, [onCode]);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    let active = true;
    let delivered = false;
    let controls: IScannerControls | undefined;
    let stream: MediaStream | undefined;
    const stop = () => {
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        if (active)
          setFailure(
            'Камера остановлена. Закройте и снова откройте сканер или введите код вручную.',
          );
        active = false;
      }
    };
    document.addEventListener('visibilitychange', hidden);
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Камера недоступна. Для неё нужен HTTPS и разрешение браузера.',
        );
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      if (!active || !video.current) {
        stop();
        return;
      }
      const hints = new Map<DecodeHintType, BarcodeFormat[]>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 250,
      });
      controls = await reader.decodeFromStream(
        stream,
        video.current,
        (result, _error, scan) => {
          if (active && !delivered && result) {
            delivered = true;
            scan.stop();
            stop();
            callback.current(result.getText());
          }
        },
      );
      if (!active || delivered) stop();
    })().catch((error: unknown) => {
      stop();
      if (active)
        setFailure(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Доступ к камере отклонён. Разрешите его в настройках Safari или введите код вручную.'
            : 'Не удалось открыть камеру. Проверьте наличие камеры и разрешение или введите код вручную.',
        );
    });
    return () => {
      active = false;
      stop();
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  return (
    <>
      {!failure && (
        <video
          ref={video}
          muted
          playsInline
          aria-label="Камера сканера штрихкодов"
          style={{
            width: '100%',
            height: 240,
            objectFit: 'cover',
            borderRadius: 16,
          }}
        />
      )}
      <AppText
        tone={failure ? 'error' : 'muted'}
        accessibilityLiveRegion="polite"
      >
        {failure || 'Наведите камеру на штрихкод. Ручной ввод доступен ниже.'}
      </AppText>
    </>
  );
}
