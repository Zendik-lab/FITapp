import { useState } from 'react';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Dialog } from '@/components/dialog';
import { SectionHeader } from '@/components/headers';
import { SettingsRow } from '@/components/settings-row';
import type { AppIconName } from '@/components/app-icon';
import type { ProfileSection } from './model';
import { activityLabels, goalLabels, sectionLabels } from './options';
import { useProfile } from './profile-context';

const icons: Record<ProfileSection, AppIconName> = {
  personal: 'CircleUserRound',
  body: 'Accessibility',
  goal: 'Target',
  activity: 'Heart',
  training: 'Dumbbell',
  nutrition: 'Utensils',
};

export function ProfileSections({
  onEdit,
}: {
  onEdit: (section: ProfileSection) => void;
}) {
  const session = useProfile();
  const [confirm, setConfirm] = useState(false);
  const profile = session?.state.profile;
  if (!profile || !session) return null;
  const summaries: Record<ProfileSection, string> = {
    personal: profile.personal.name,
    body: `${profile.body.currentWeightKg} кг`,
    goal: goalLabels[profile.goals.kind],
    activity: activityLabels[profile.activity.level],
    training: `${profile.training.sessionsPerWeek} в неделю`,
    nutrition: profile.nutrition.diet || 'Без особого режима',
  };
  return (
    <>
      <SectionHeader title="Мой профиль" />
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {(Object.keys(sectionLabels) as ProfileSection[]).map(
          (section, index) => (
            <SettingsRow
              key={section}
              label={sectionLabels[section]}
              icon={icons[section]}
              value={summaries[section]}
              divider={index > 0}
              onPress={() => onEdit(section)}
            />
          ),
        )}
      </Card>
      <PrimaryButton
        label="Пройти анкетирование заново"
        onPress={() => setConfirm(true)}
        secondary
      />
      <Dialog
        open={confirm}
        title="Пройти анкетирование заново?"
        onDismiss={() => {
          if (!session.pending) setConfirm(false);
        }}
      >
        <AppText>
          Текущий профиль подставится в ответы. Остальные данные и настройки
          сохранятся.
        </AppText>
        {session.failure && (
          <AppText tone="error" accessibilityRole="alert">
            {session.failure}
          </AppText>
        )}
        <PrimaryButton
          label={session.pending ? 'Сохраняем…' : 'Начать заново'}
          disabled={session.pending}
          onPress={() => {
            void session.restart().catch(() => {});
          }}
        />
        <PrimaryButton
          label="Отмена"
          disabled={session.pending}
          onPress={() => setConfirm(false)}
          secondary
        />
      </Dialog>
    </>
  );
}
