import { AppText } from '@/components/app-text';
import { ChoiceGroup, FormField, FormGroup } from '@/components/form-controls';
import { type ProfileDraft, type ProfileSection } from './model';
import { activityDescriptions, activityLabels, goalLabels } from './options';
import { ageFromBirthDate, numeric, type ProfileErrors } from './validation';

export const sectionFields: Record<
  ProfileSection,
  readonly (keyof ProfileDraft)[]
> = {
  personal: ['name', 'birthDate', 'sex'],
  body: ['height', 'currentWeight'],
  goal: ['goal', 'targetWeight', 'paceMode', 'pace'],
  activity: ['activity'],
  training: ['sessions', 'trainingType', 'experience'],
  nutrition: ['meals', 'diet', 'excludedFoods', 'allergies', 'restrictions'],
};

export function ProfileFields({
  section,
  draft,
  errors,
  onChange,
  goalOnly = false,
}: {
  section: ProfileSection;
  draft: ProfileDraft;
  errors: ProfileErrors;
  onChange: (draft: ProfileDraft) => void;
  goalOnly?: boolean;
}) {
  function change<K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) {
    const next = { ...draft, [key]: value };
    if (key === 'goal' && value === 'maintain')
      next.targetWeight = next.currentWeight;
    if (key === 'currentWeight' && next.goal === 'maintain')
      next.targetWeight = value;
    onChange(next);
  }
  function field(
    key: keyof ProfileDraft,
    label: string,
    numericInput = false,
    hint?: string,
    multiline = false,
  ) {
    return (
      <FormField
        name={key}
        label={label}
        value={draft[key]}
        onChangeText={(value) => change(key, value)}
        error={errors[key]}
        hint={hint}
        keyboardType={numericInput ? 'decimal-pad' : 'default'}
        multiline={multiline}
      />
    );
  }
  if (section === 'personal') {
    const age = ageFromBirthDate(draft.birthDate);
    return (
      <FormGroup>
        {field('name', 'Имя')}
        <FormField
          name="birthDate"
          label="Дата рождения"
          value={draft.birthDate}
          onChangeText={(value) => change('birthDate', value)}
          error={errors.birthDate}
          hint={age === null ? 'Формат: ДД.ММ.ГГГГ' : `Возраст: ${age}`}
          placeholder="ДД.ММ.ГГГГ"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <ChoiceGroup
          label="Пол"
          value={draft.sex}
          onChange={(value) => change('sex', value)}
          error={errors.sex}
          options={[
            { value: 'male', label: 'Мужской' },
            { value: 'female', label: 'Женский' },
            { value: 'unspecified', label: 'Предпочитаю не указывать' },
          ]}
        />
      </FormGroup>
    );
  }
  if (section === 'body')
    return (
      <FormGroup>
        {field('height', 'Рост, см', true)}
        {field('currentWeight', 'Текущий вес, кг', true)}
      </FormGroup>
    );
  if (section === 'goal') {
    if (goalOnly)
      return (
        <ChoiceGroup
          label="Цель"
          value={draft.goal}
          onChange={(value) => change('goal', value)}
          error={errors.goal}
          options={Object.entries(goalLabels).map(([value, label]) => ({
            value: value as Exclude<ProfileDraft['goal'], ''>,
            label,
          }))}
        />
      );
    const difference =
      numeric(draft.targetWeight) - numeric(draft.currentWeight);
    return (
      <FormGroup>
        <ProfileFields
          section="goal"
          goalOnly
          draft={draft}
          errors={errors}
          onChange={onChange}
        />
        {field(
          'targetWeight',
          'Целевой вес, кг',
          true,
          draft.goal === 'maintain'
            ? 'Для поддержания целевой вес равен текущему.'
            : undefined,
        )}
        {Number.isFinite(difference) && (
          <AppText tone="accentText">
            Разница с текущим весом: {difference > 0 ? '+' : ''}
            {difference.toLocaleString('ru-KZ', {
              maximumFractionDigits: 2,
            })}{' '}
            кг
          </AppText>
        )}
        {draft.goal !== 'maintain' ? (
          <>
            <ChoiceGroup
              label="Темп изменения веса"
              value={draft.paceMode}
              onChange={(value) => change('paceMode', value)}
              error={errors.paceMode}
              options={[
                {
                  value: 'recommended',
                  label: 'Рекомендованный: 0,25 кг в неделю',
                  description:
                    'Начальный ориентир. Подходящий темп индивидуален.',
                },
                { value: 'custom', label: 'Свой темп' },
              ]}
            />
            {draft.paceMode === 'custom' &&
              field('pace', 'Темп, кг в неделю', true)}
          </>
        ) : (
          <AppText tone="muted">Темп изменения веса: 0 кг в неделю.</AppText>
        )}
        <AppText tone="muted" variant="caption">
          Темп — ориентир, а не обещание результата к определённой дате.
        </AppText>
      </FormGroup>
    );
  }
  if (section === 'activity')
    return (
      <ChoiceGroup
        label="Активность в течение дня"
        value={draft.activity}
        onChange={(value) => change('activity', value)}
        error={errors.activity}
        options={(
          Object.keys(activityLabels) as (keyof typeof activityLabels)[]
        ).map((value) => ({
          value,
          label: activityLabels[value],
          description: activityDescriptions[value],
        }))}
      />
    );
  if (section === 'training')
    return (
      <FormGroup>
        {field(
          'sessions',
          'Тренировок в неделю',
          true,
          'От 0 до 14. Укажите 0, если пока не тренируетесь.',
        )}
        {numeric(draft.sessions) > 0 && (
          <>
            <ChoiceGroup
              label="Тип тренировок"
              value={draft.trainingType}
              onChange={(value) => change('trainingType', value)}
              error={errors.trainingType}
              options={[
                { value: 'strength', label: 'Силовые' },
                { value: 'cardio', label: 'Кардио' },
                { value: 'mixed', label: 'Смешанные' },
                { value: 'other', label: 'Другие' },
              ]}
            />
            <ChoiceGroup
              label="Уровень подготовки"
              value={draft.experience}
              onChange={(value) => change('experience', value)}
              error={errors.experience}
              options={[
                { value: 'beginner', label: 'Начинающий' },
                { value: 'intermediate', label: 'Средний' },
                { value: 'experienced', label: 'Опытный' },
              ]}
            />
          </>
        )}
      </FormGroup>
    );
  return (
    <FormGroup>
      <AppText tone="muted">
        Все поля необязательны. Их можно заполнить позже в профиле.
      </AppText>
      {field('meals', 'Приёмов пищи в день', true)}
      {field(
        'diet',
        'Предпочтительный режим питания',
        false,
        'Например: обычный, вегетарианский, без особого режима.',
      )}
      {field(
        'excludedFoods',
        'Не употребляю',
        false,
        'Перечислите продукты или оставьте поле пустым.',
        true,
      )}
      {field('allergies', 'Аллергии', false, undefined, true)}
      {field('restrictions', 'Пищевые ограничения', false, undefined, true)}
    </FormGroup>
  );
}
