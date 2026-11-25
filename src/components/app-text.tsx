import { use } from 'react';
import { Text, type TextProps } from 'react-native';

import { defaultAppSettings } from '@/features/settings/app-settings';
import { AppSettingsContext } from '@/features/settings/app-settings-context';
import { typography, useAppTheme } from '@/theme';

type AppTextProps = TextProps & {
  variant?: keyof typeof typography;
  tone?: 'text' | 'muted' | 'accentText' | 'onAccent' | 'error';
};

export function AppText({
  variant = 'body',
  tone = 'text',
  style,
  ...props
}: AppTextProps) {
  const { colors } = useAppTheme();
  const locale =
    use(AppSettingsContext)?.settings.locale ?? defaultAppSettings.locale;
  return (
    <Text
      accessibilityLanguage={locale}
      style={[typography[variant], { color: colors[tone] }, style]}
      {...props}
    />
  );
}
