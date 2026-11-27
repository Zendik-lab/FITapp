import { use, useState } from 'react';
import { ActionNotice } from '@/components/action-notice';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { ChoiceGroup, FormField } from '@/components/form-controls';
import { SectionHeader } from '@/components/headers';
import { FoodForm } from '@/features/food/food-form';
import { describeError } from '@/database/storage-diagnostics';
import { AppSettingsContext } from './app-settings-context';
import {
  accentOptions,
  defaultPersonalization,
  homeCards,
  motionOptions,
  moveHomeCard,
  type HomeCard,
} from './personalization';
import { ReorderHandle } from './reorder-handle';

const toggles = [
  { key: 'timeGreeting', label: 'Приветствие по времени суток' },
  { key: 'haptics', label: 'Тактильная отдача' },
  { key: 'motivation', label: 'Поздравления и мотивация' },
] as const;

export function PersonalizationScreen({ onBack }: { onBack(): void }) {
  const settings = use(AppSettingsContext);
  const saved = settings?.settings.personalization ?? defaultPersonalization;
  const [draft, setDraft] = useState(saved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  function move(id: HomeCard, direction: -1 | 1) {
    setDraft((previous) => ({
      ...previous,
      order: moveHomeCard(previous.order, id, direction),
    }));
  }

  async function save() {
    if (!settings?.setPersonalization || pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await settings.setPersonalization(draft);
      setMessage('Оформление сохранено.');
    } catch (error) {
      setError(describeError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <FoodForm
      title="Персонализация"
      onBack={onBack}
      dirty={dirty}
      pending={pending}
      error={error}
    >
      <ActionNotice
        message={message && !dirty ? { text: message, kind: 'success' } : null}
      />
      <ChoiceGroup
        compact
        label="Акцент"
        value={draft.accent}
        options={accentOptions}
        onChange={(accent) => setDraft({ ...draft, accent })}
      />
      <ChoiceGroup
        compact
        label="Движение"
        value={draft.motion}
        options={motionOptions}
        onChange={(motion) => setDraft({ ...draft, motion })}
      />
      <FormField
        name="greeting"
        label="Своё приветствие"
        value={draft.greeting}
        maxLength={60}
        onChangeText={(greeting) => setDraft({ ...draft, greeting })}
      />
      {toggles.map(({ key, label }) => (
        <PrimaryButton
          key={key}
          secondary
          label={`${label} · ${draft[key] ? 'Вкл.' : 'Выкл.'}`}
          onPress={() => setDraft({ ...draft, [key]: !draft[key] })}
        />
      ))}
      <SectionHeader title="Карточки «Сегодня»" />
      {draft.order.map((id, index) => {
        const label = homeCards.find((card) => card.id === id)?.label ?? id;
        const visible = !draft.hidden.includes(id);
        return (
          <Card key={id}>
            <AppText variant="action">
              {label} · {visible ? 'Показана' : 'Скрыта'}
            </AppText>
            <ReorderHandle
              disabled={pending}
              onMove={(direction) => move(id, direction)}
            />
            <PrimaryButton
              secondary
              disabled={pending}
              label={`${visible ? 'Скрыть' : 'Показать'}: ${label}`}
              onPress={() =>
                setDraft({
                  ...draft,
                  hidden: visible
                    ? [...draft.hidden, id]
                    : draft.hidden.filter((card) => card !== id),
                })
              }
            />
            {index > 0 && (
              <PrimaryButton
                secondary
                disabled={pending}
                label={`Выше: ${label}`}
                onPress={() => move(id, -1)}
              />
            )}
            {index + 1 < draft.order.length && (
              <PrimaryButton
                secondary
                disabled={pending}
                label={`Ниже: ${label}`}
                onPress={() => move(id, 1)}
              />
            )}
          </Card>
        );
      })}
      <PrimaryButton
        label="Сохранить оформление"
        disabled={!dirty || pending}
        onPress={() => void save()}
      />
    </FoodForm>
  );
}
