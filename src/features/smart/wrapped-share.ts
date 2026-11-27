import { Platform, Share } from 'react-native';

export interface WrappedSummary {
  period: string;
  days: number;
  meals: number;
}

export function wrappedText({ period, days, meals }: WrappedSummary) {
  return `FIT Wrapped · ${period}\nДней с записями: ${days}\nЗаписанных приёмов пищи: ${meals}`;
}

export function canShareWrapped() {
  return (
    Platform.OS !== 'web' ||
    (typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  );
}

export async function shareWrapped(
  summary: WrappedSummary,
  colors: {
    background: string;
    surface: string;
    text: string;
    accentText: string;
  },
) {
  const text = wrappedText(summary);
  if (Platform.OS !== 'web') {
    await Share.share({ message: text });
    return;
  }

  let files: File[] | undefined;
  if (typeof navigator.canShare === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, 640, 420);
      ctx.fillStyle = colors.surface;
      ctx.fillRect(24, 24, 592, 372);
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 46px system-ui, sans-serif';
      ctx.fillText('FIT Wrapped', 55, 108);
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillText(summary.period, 55, 150);
      ctx.fillStyle = colors.accentText;
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText(String(summary.days), 55, 260);
      ctx.fillText(String(summary.meals), 325, 260);
      ctx.fillStyle = colors.text;
      ctx.font = '21px system-ui, sans-serif';
      ctx.fillText('Дней с записями', 55, 305);
      ctx.fillText('Приёмов пищи', 325, 305);
      const content = canvas.toDataURL('image/png').split(',')[1];
      if (content) {
        const file = new File(
          [Uint8Array.from(atob(content), (char) => char.charCodeAt(0))],
          'fit-wrapped.png',
          { type: 'image/png' },
        );
        if (navigator.canShare({ files: [file] })) files = [file];
      }
    }
  }
  try {
    await navigator.share(
      files ? { title: 'FIT Wrapped', files } : { title: 'FIT Wrapped', text },
    );
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      throw error;
  }
}
