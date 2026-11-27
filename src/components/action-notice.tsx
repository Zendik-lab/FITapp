import { AppText } from './app-text';
import { PrimaryButton } from './buttons';
import { Card } from './card';
import { SceneTransition } from './screen-stack';

export type ActionMessage = {
  text: string;
  kind?: 'success' | 'error' | 'warning';
  undo?: () => void;
};

export function ActionNotice({
  message,
  pending,
  dismiss,
}: {
  message: ActionMessage | null;
  pending?: boolean;
  dismiss?(): void;
}) {
  if (!message) return null;
  return (
    <SceneTransition transitionKey={message.text}>
      <Card>
        <AppText
          tone={
            message.kind === 'error'
              ? 'error'
              : message.kind === 'success'
                ? 'accentText'
                : 'text'
          }
          accessibilityRole={message.kind === 'error' ? 'alert' : 'status'}
          accessibilityLiveRegion={
            message.kind === 'error' ? 'assertive' : 'polite'
          }
        >
          {message.text}
        </AppText>
        {message.undo && (
          <PrimaryButton
            secondary
            label="Отменить удаление"
            disabled={pending}
            onPress={message.undo}
          />
        )}
        {dismiss && (
          <PrimaryButton
            secondary
            label="Скрыть уведомление"
            onPress={dismiss}
          />
        )}
      </Card>
    </SceneTransition>
  );
}
