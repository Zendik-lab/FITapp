import { useState } from 'react';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { FormField } from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { addDays } from '@/features/calendar/calendar';
import { dateKey, parseDateKey } from '@/features/food/domain';
import { FoodForm } from '@/features/food/food-form';
import type { FoodSession } from '@/features/food/food-context';
import type { PlanDay, PlanMeal, PlanTemplate } from './model';
import { planDates, readPlanner } from './operations';

export function CopyPlanForm({
  day,
  pending,
  onClose,
  onCopy,
}: {
  day: PlanDay;
  pending: boolean;
  onClose(): void;
  onCopy(dates: string[]): Promise<void>;
}) {
  const nextDay = dateKey(addDays(parseDateKey(day.date), 1));
  const [start, setStart] = useState(nextDay);
  const [count, setCount] = useState('1');
  const [error, setError] = useState('');
  async function submit() {
    try {
      if (
        !/^\d+$/.test(count.trim()) ||
        Number(count) < 1 ||
        Number(count) > 14
      )
        throw new Error('Укажите от 1 до 14 дней.');
      const dates = planDates(start.trim(), Number(count)).filter(
        (date) => date !== day.date,
      );
      if (!dates.length) throw new Error('Укажите другую дату.');
      await onCopy(dates);
    } catch (cause) {
      setError(describeError(cause));
    }
  }
  return (
    <FoodForm
      title="Копировать или повторить рацион"
      onBack={onClose}
      pending={pending}
      error={error}
      dirty={start !== nextDay || count !== '1'}
    >
      <FormField
        name="plan-copy-start"
        label="Первая дата, ГГГГ-ММ-ДД"
        value={start}
        onChangeText={setStart}
        maxLength={10}
      />
      <FormField
        name="plan-copy-count"
        label="Дней подряд"
        inputMode="numeric"
        value={count}
        onChangeText={setCount}
        maxLength={2}
      />
      <PrimaryButton
        label="Копировать рацион"
        disabled={pending}
        onPress={() => void submit()}
      />
    </FoodForm>
  );
}

export function SavePlanTemplateForm({
  meals,
  pending,
  onClose,
  onSave,
}: {
  meals: PlanMeal[];
  pending: boolean;
  onClose(): void;
  onSave(name: string): Promise<void>;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    try {
      if (!name.trim()) throw new Error('Введите название шаблона.');
      await onSave(name.trim());
    } catch (cause) {
      setError(describeError(cause));
    }
  }
  return (
    <FoodForm
      title="Сохранить как шаблон"
      onBack={onClose}
      pending={pending}
      dirty={!!name}
      error={error}
    >
      <Card>
        {meals.map((meal) => (
          <AppText key={meal.id} tone="muted">
            {meal.title} · {meal.items.length} поз.
          </AppText>
        ))}
      </Card>
      <FormField
        name="plan-template-name"
        label="Название шаблона"
        value={name}
        onChangeText={setName}
        maxLength={80}
        hint="Например, любимый завтрак или тренировочный день."
      />
      <PrimaryButton
        label="Сохранить шаблон"
        disabled={pending}
        onPress={() => void submit()}
      />
    </FoodForm>
  );
}

export function PlanTemplates({
  session,
  onClose,
  onApply,
  onRemove,
}: {
  session: FoodSession;
  onClose(): void;
  onApply(template: PlanTemplate, append: boolean): Promise<void>;
  onRemove(template: PlanTemplate): void;
}) {
  const templates = readPlanner(session.state).templates;
  const disabled = session.pending || !!session.failure;
  const [error, setError] = useState('');
  async function apply(template: PlanTemplate) {
    setError('');
    try {
      await onApply(template, template.meals.length === 1);
    } catch (cause) {
      setError(describeError(cause));
    }
  }
  return (
    <FoodForm
      title="Шаблоны питания"
      onBack={onClose}
      readOnly
      pending={session.pending}
      error={error}
    >
      {!templates.length && (
        <AppText tone="muted">
          Сохраните день или отдельный приём пищи из планировщика. Они появятся
          здесь.
        </AppText>
      )}
      {templates.map((template) => (
        <Card key={template.id}>
          <AppText variant="section">{template.name}</AppText>
          <AppText variant="caption" tone="muted">
            {template.meals.map((meal) => meal.title).join(' · ')}
          </AppText>
          <PrimaryButton
            label={
              template.meals.length === 1
                ? 'Добавить к плану'
                : 'Применить к дню'
            }
            disabled={disabled}
            onPress={() => void apply(template)}
          />
          <PrimaryButton
            secondary
            label="Удалить шаблон"
            disabled={disabled}
            onPress={() => onRemove(template)}
          />
        </Card>
      ))}
    </FoodForm>
  );
}
