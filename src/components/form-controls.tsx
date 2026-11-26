import {
  createContext,
  use,
  useCallback,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Pressable,
  Platform,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextInputInstance,
} from 'react-native';
import { AppText } from './app-text';
import { AppIcon } from './app-icon';
import { RadioGroup } from './radio-group';
import { radii, spacing, touchSize, typography, useAppTheme } from '@/theme';

export const FieldFocusContext = createContext<RefObject<
  Map<string, TextInputInstance>
> | null>(null);
export const FormDisabledContext = createContext(false);

export function FormField({
  name,
  label,
  error,
  hint,
  inputMode,
  keyboardType,
  ...props
}: TextInputProps & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  const { colors } = useAppTheme();
  const fields = use(FieldFocusContext);
  const disabled = use(FormDisabledContext);
  const [ready, setReady] = useState(Platform.OS !== 'web');
  const registerField = useCallback(
    (input: TextInputInstance | null) => {
      // The ref's commit update flushes RN Web's passive selection restore
      // before the field becomes editable; subsequent typing never changes refs.
      if (input && Platform.OS === 'web') setReady(true);
      if (!fields) return;
      if (input) fields.current.set(name, input);
      else fields.current.delete(name);
    },
    [fields, name],
  );
  const numericInput = inputMode === 'numeric' || inputMode === 'decimal';
  const descriptionId = error
    ? `${name}-error`
    : hint
      ? `${name}-hint`
      : undefined;
  return (
    <View style={styles.group}>
      <AppText nativeID={`${name}-label`} variant="action">
        {label}
      </AppText>
      <TextInput
        editable={!disabled && ready}
        ref={registerField}
        inputMode={inputMode}
        keyboardType={
          keyboardType ??
          (inputMode === 'decimal'
            ? 'decimal-pad'
            : inputMode === 'numeric'
              ? 'number-pad'
              : 'default')
        }
        autoCorrect={!numericInput}
        autoCapitalize={numericInput ? 'none' : 'sentences'}
        spellCheck={!numericInput}
        nativeID={name}
        accessibilityLabel={label}
        aria-labelledby={`${name}-label`}
        aria-describedby={descriptionId}
        aria-invalid={!!error}
        placeholderTextColor={colors.muted}
        maxLength={1000}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.error : colors.border,
          },
          props.multiline && styles.multiline,
        ]}
        {...props}
      />
      {hint && (
        <AppText nativeID={`${name}-hint`} variant="caption" tone="muted">
          {hint}
        </AppText>
      )}
      {error && (
        <AppText
          nativeID={`${name}-error`}
          tone="error"
          accessibilityRole="alert"
        >
          {error}
        </AppText>
      )}
    </View>
  );
}

export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: T | '';
  options: readonly { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
  error?: string;
}) {
  const { colors } = useAppTheme();
  const disabled = use(FormDisabledContext);
  return (
    <View style={styles.group}>
      <AppText variant="action">{label}</AppText>
      <RadioGroup label={label}>
        {options.map((option, index) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            accessibilityState={{ checked: value === option.value, disabled }}
            aria-checked={value === option.value}
            aria-disabled={disabled}
            disabled={disabled}
            tabIndex={
              value === option.value || (!value && index === 0) ? 0 : -1
            }
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.choice,
              {
                backgroundColor:
                  value === option.value || pressed
                    ? colors.accentSurface
                    : colors.surface,
                borderColor:
                  value === option.value ? colors.accentText : colors.border,
              },
            ]}
          >
            <View style={styles.choiceText}>
              <AppText variant="action">{option.label}</AppText>
              {option.description && (
                <AppText variant="caption" tone="muted">
                  {option.description}
                </AppText>
              )}
            </View>
            {value === option.value && <AppIcon name="Check" />}
          </Pressable>
        ))}
      </RadioGroup>
      {error && (
        <AppText tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      )}
    </View>
  );
}

export function FormGroup({ children }: { children: ReactNode }) {
  return <View style={styles.fields}>{children}</View>;
}

const styles = StyleSheet.create({
  group: { gap: spacing.small },
  fields: { gap: spacing.large },
  input: {
    ...typography.body,
    minHeight: touchSize,
    borderWidth: 1,
    borderRadius: radii.action,
    padding: spacing.compact,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  choice: {
    minHeight: touchSize,
    borderWidth: 1,
    borderRadius: radii.action,
    padding: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  choiceText: { flex: 1, gap: spacing.tight },
});
