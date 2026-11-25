import { useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import {
  StyleSheet,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { FieldFocusContext } from '@/components/form-controls';
import { FormScreen } from '@/components/form-screen';
import { radii, spacing, useAppTheme } from '@/theme';
import type { ProfileDraft, ProfileSection } from './model';
import { stepTitles } from './options';
import { ProfileFields, sectionFields } from './profile-fields';
import { useProfile } from './profile-context';
import { ProfileSummary } from './profile-summary';
import {
  profileWarnings,
  validateDraft,
  type ProfileErrors,
} from './validation';

const stepKeys: readonly (readonly (keyof ProfileDraft)[])[] = [
  [],
  [...sectionFields.personal, ...sectionFields.body],
  ['goal'],
  sectionFields.goal,
  sectionFields.activity,
  sectionFields.training,
  sectionFields.nutrition,
];
const sectionSteps: Record<ProfileSection, number> = {
  personal: 1,
  body: 1,
  goal: 3,
  activity: 4,
  training: 5,
  nutrition: 6,
};

export function OnboardingGate({ children }: { children: ReactNode }) {
  const session = useProfile();
  return session && !session.state.onboarding.completed ? (
    <OnboardingScreen />
  ) : (
    children
  );
}

export function OnboardingScreen() {
  const session = useProfile();
  const { colors } = useAppTheme();
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const fields = useRef(new Map<string, TextInputInstance>());
  const scroll = useRef<ScrollViewInstance>(null);
  if (!session) return null;
  const { draft, step } = session.state.onboarding;
  const warnings = step === 3 || step === 7 ? profileWarnings(draft) : [];

  async function move(next: number) {
    if (!session || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await session.goToStep(next);
      setErrors({});
    } catch {
      /* Session keeps values and exposes retry. */
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function next() {
    if (!session || submittingRef.current) return;
    const allErrors = validateDraft(draft);
    const visible =
      step === 7
        ? allErrors
        : (Object.fromEntries(
            Object.entries(allErrors).filter(([key]) =>
              stepKeys[step]?.includes(key as keyof ProfileDraft),
            ),
          ) as ProfileErrors);
    setErrors(visible);
    if (Object.keys(visible).length) {
      if (step === 7) {
        const invalidStep = stepKeys.findIndex((keys) =>
          keys.some((key) => visible[key]),
        );
        await move(invalidStep < 1 ? 1 : invalidStep);
        setErrors(visible);
      }
      scroll.current?.scrollTo({ y: 0, animated: true });
      fields.current.get(Object.keys(visible)[0])?.focus();
      return;
    }
    if (step < 7) {
      await move(
        reviewing && Object.keys(allErrors).length === 0 ? 7 : step + 1,
      );
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await session.complete(draft);
      router.replace('/');
    } catch {
      /* Session exposes the storage failure without navigating. */
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <FieldFocusContext value={fields}>
      <FormScreen
        transitionKey={step}
        scrollRef={scroll}
        disabled={submitting}
        blockUpdate={session.pending || !!session.failure}
      >
        <View style={styles.progressGroup}>
          <AppText variant="caption" tone="muted">
            Шаг {step + 1} из 8
          </AppText>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Прогресс анкетирования"
            accessibilityValue={{ min: 1, max: 8, now: step + 1 }}
            aria-valuemin={1}
            aria-valuemax={8}
            aria-valuenow={step + 1}
            style={[styles.track, { backgroundColor: colors.border }]}
          >
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: colors.accent,
                  width: `${((step + 1) / 8) * 100}%`,
                },
              ]}
            />
          </View>
        </View>
        <AppText variant="title" accessibilityRole="header">
          {step === 0 ? 'MassTracker' : stepTitles[step]}
        </AppText>
        {step === 0 && (
          <>
            <AppText variant="section">Начните со своей цели.</AppText>
            <AppText tone="muted">
              Расскажите о себе, активности и привычках питания. Профиль поможет
              держать текущий и желаемый вес перед глазами.
            </AppText>
            <Card>
              <AppText>Восемь коротких шагов</AppText>
              <AppText tone="muted">
                Можно вернуться и изменить ответы. Они сохраняются на этом
                устройстве; регистрация не нужна.
              </AppText>
            </Card>
          </>
        )}
        {step === 1 && (
          <>
            <ProfileFields
              section="personal"
              draft={draft}
              errors={errors}
              onChange={session.updateDraft}
            />
            <ProfileFields
              section="body"
              draft={draft}
              errors={errors}
              onChange={session.updateDraft}
            />
          </>
        )}
        {step === 2 && (
          <ProfileFields
            section="goal"
            goalOnly
            draft={draft}
            errors={errors}
            onChange={session.updateDraft}
          />
        )}
        {step === 3 && (
          <ProfileFields
            section="goal"
            draft={draft}
            errors={errors}
            onChange={session.updateDraft}
          />
        )}
        {step >= 4 && step <= 6 && (
          <ProfileFields
            section={(['activity', 'training', 'nutrition'] as const)[step - 4]}
            draft={draft}
            errors={errors}
            onChange={session.updateDraft}
          />
        )}
        {step === 7 && (
          <>
            <AppText tone="muted">
              Проверьте ответы. Любой раздел можно изменить.
            </AppText>
            <ProfileSummary
              draft={draft}
              onEdit={(section) => {
                setReviewing(true);
                void move(sectionSteps[section]);
              }}
            />
          </>
        )}
        {warnings.map((warning) => (
          <Card key={warning}>
            <AppText accessibilityRole="alert">{warning}</AppText>
          </Card>
        ))}
        {session.failure && (
          <Card>
            <AppText tone="error" accessibilityRole="alert">
              {session.failure}
            </AppText>
            <PrimaryButton
              label="Повторить сохранение"
              disabled={session.pending}
              onPress={() => {
                void session.retrySave().catch(() => {});
              }}
              secondary
            />
          </Card>
        )}
        <AppText
          variant="caption"
          tone="muted"
          accessibilityLiveRegion="polite"
        >
          {session.pending
            ? 'Сохраняем…'
            : session.failure
              ? 'Изменения ещё не сохранены.'
              : 'Ответы сохранены на устройстве.'}
        </AppText>
        <View style={styles.actions}>
          <PrimaryButton
            label={
              submitting
                ? 'Сохраняем…'
                : step === 0
                  ? 'Начать'
                  : step === 7
                    ? 'Создать мой профиль'
                    : 'Продолжить'
            }
            disabled={submitting}
            onPress={() => void next()}
          />
          {step === 6 && (
            <PrimaryButton
              label="Пропустить необязательные поля"
              disabled={submitting}
              onPress={() => {
                session.updateDraft({
                  ...draft,
                  meals: '',
                  diet: '',
                  excludedFoods: '',
                  allergies: '',
                  restrictions: '',
                });
                void move(7);
              }}
              secondary
            />
          )}
          {step > 0 && (
            <PrimaryButton
              label="Назад"
              disabled={submitting}
              onPress={() => void move(step - 1)}
              secondary
            />
          )}
        </View>
      </FormScreen>
    </FieldFocusContext>
  );
}

const styles = StyleSheet.create({
  progressGroup: { gap: spacing.small },
  track: { height: 4, borderRadius: radii.action, overflow: 'hidden' },
  fill: { height: '100%' },
  actions: { gap: spacing.small, marginTop: 'auto', paddingTop: spacing.small },
});
