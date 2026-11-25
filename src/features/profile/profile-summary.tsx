import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { spacing } from '@/theme';
import type { ProfileDraft, ProfileSection } from './model';
import { activityLabels, goalLabels, sectionLabels } from './options';
import { ageFromBirthDate } from './validation';

export function ProfileSummary({
  draft,
  onEdit,
}: {
  draft: ProfileDraft;
  onEdit: (section: ProfileSection) => void;
}) {
  const summaries: Record<ProfileSection, string> = {
    personal: `${draft.name}, возраст: ${ageFromBirthDate(draft.birthDate) ?? '—'}\n${draft.birthDate} · ${draft.sex === 'male' ? 'Мужской' : draft.sex === 'female' ? 'Женский' : 'Пол не указан'}`,
    body: `Рост: ${draft.height} см\nТекущий вес: ${draft.currentWeight} кг`,
    goal: `${draft.goal ? goalLabels[draft.goal] : 'Не выбрана'}\nЦелевой вес: ${draft.targetWeight} кг\nТемп: ${draft.goal === 'maintain' ? '0' : draft.paceMode === 'recommended' ? '0,25' : draft.pace} кг в неделю`,
    activity: draft.activity ? activityLabels[draft.activity] : 'Не выбрана',
    training: `Тренировок в неделю: ${draft.sessions}${Number(draft.sessions) > 0 ? `\n${{ strength: 'Силовые', cardio: 'Кардио', mixed: 'Смешанные', other: 'Другие', '': '—' }[draft.trainingType]} · ${{ beginner: 'Начинающий', intermediate: 'Средний', experienced: 'Опытный', '': '—' }[draft.experience]}` : ' · Без тренировок'}`,
    nutrition: `Приёмов пищи: ${draft.meals || 'не указано'}\nРежим: ${draft.diet || 'не указан'}\nНе употребляю: ${draft.excludedFoods || 'не указано'}\nАллергии: ${draft.allergies || 'не указаны'}\nОграничения: ${draft.restrictions || 'не указаны'}`,
  };
  return (
    <View style={styles.group}>
      {(Object.keys(summaries) as ProfileSection[]).map((section) => (
        <Card key={section}>
          <AppText variant="section">{sectionLabels[section]}</AppText>
          <AppText>{summaries[section]}</AppText>
          <PrimaryButton
            label={`Изменить: ${sectionLabels[section]}`}
            onPress={() => onEdit(section)}
            secondary
          />
        </Card>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({ group: { gap: spacing.medium } });
