import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { AppText } from '@/components/app-text';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Dialog } from '@/components/dialog';
import { FormScreen } from '@/components/form-screen';
import { spacing } from '@/theme';
import { DiaryStatus } from './diary-status';

export function FoodForm({
  title,
  children,
  onBack,
  dirty = false,
  pending = false,
  readOnly = false,
  error,
}: {
  title: string;
  children: ReactNode;
  onBack(): void;
  dirty?: boolean;
  pending?: boolean;
  readOnly?: boolean;
  error?: string;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  const [discard, setDiscard] = useState(false);
  return (
    <FormScreen
      withinTabs
      transitionKey={title}
      scrollRef={scroll}
      disabled={pending}
      readOnly={readOnly}
      blockUpdate={dirty || pending}
    >
      <View style={styles.header}>
        <IconButton
          icon="ChevronLeft"
          label="Назад"
          disabled={pending}
          onPress={() => (dirty ? setDiscard(true) : onBack())}
        />
        <AppText
          variant="title"
          accessibilityRole="header"
          style={styles.title}
        >
          {title}
        </AppText>
      </View>
      <DiaryStatus />
      {!!error && (
        <AppText tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      )}
      {children}
      <Dialog
        open={discard}
        title="Выйти без сохранения?"
        onDismiss={() => setDiscard(false)}
      >
        <AppText>Изменения в этой форме не будут сохранены.</AppText>
        <PrimaryButton
          secondary
          label="Продолжить редактирование"
          onPress={() => setDiscard(false)}
        />
        <PrimaryButton label="Выйти без сохранения" onPress={onBack} />
      </Dialog>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.compact },
  title: { flex: 1, minWidth: 0 },
});
