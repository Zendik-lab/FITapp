import type { KeyboardEvent } from 'react';
import { spacing } from '@/theme';
import type { RadioGroupProps } from './radio-group';

export function RadioGroup({ label, children, compact }: RadioGroupProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement)) return;
    const current = event.target.closest<HTMLElement>('[role="radio"]');
    if (!current || !event.currentTarget.contains(current)) return;
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="radio"]:not([aria-disabled="true"])',
      ),
    );
    const index = options.indexOf(current);
    if (index < 0) return;
    let next: HTMLElement;
    if (event.key === ' ') next = current;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      next = options[(index + 1) % options.length];
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      next = options[(index + options.length - 1) % options.length];
    else return;
    event.preventDefault();
    next.focus();
    next.click();
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        flexWrap: compact ? 'wrap' : 'nowrap',
        gap: spacing.small,
      }}
    >
      {children}
    </div>
  );
}
