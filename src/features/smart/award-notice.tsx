import { use } from 'react';
import { ActionNotice } from '@/components/action-notice';
import { useFoodDiary } from '@/features/food/food-context';
import { AppSettingsContext } from '@/features/settings/app-settings-context';

export function AwardNotice() {
  const session = useFoodDiary();
  const motivation =
    use(AppSettingsContext)?.settings.personalization?.motivation ?? true;
  if (!session?.award || !motivation) return null;
  return (
    <ActionNotice
      message={{ text: session.award.label, kind: 'success' }}
      dismiss={session.dismissAward}
    />
  );
}
