import { useRef, useState } from 'react';
import type { ScrollViewInstance, TextInputInstance } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Dialog } from '@/components/dialog';
import { FieldFocusContext } from '@/components/form-controls';
import { FormScreen } from '@/components/form-screen';
import { profileToDraft, type ProfileSection, type UserProfile } from './model';
import { sectionLabels } from './options';
import { useProfile } from './profile-context';
import { ProfileFields } from './profile-fields';
import {
  profileWarnings,
  validateDraft,
  type ProfileErrors,
} from './validation';

export function ProfileEditor({
  profile,
  section,
  onClose,
}: {
  profile: UserProfile;
  section: ProfileSection;
  onClose: (saved: boolean) => void;
}) {
  const session = useProfile();
  const [initial] = useState(() => profileToDraft(profile));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const guard = useRef(false);
  const fields = useRef(new Map<string, TextInputInstance>());
  const scroll = useRef<ScrollViewInstance>(null);
  const warnings =
    section === 'goal' || section === 'body' ? profileWarnings(draft) : [];
  async function save() {
    if (!session || guard.current) return;
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      fields.current.get(Object.keys(nextErrors)[0])?.focus();
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    guard.current = true;
    setSaving(true);
    try {
      await session.complete(draft);
      onClose(true);
    } catch {
      /* Provider exposes retry while the editor preserves its draft. */
    } finally {
      guard.current = false;
      setSaving(false);
    }
  }
  return (
    <FieldFocusContext value={fields}>
      <FormScreen
        transitionKey={section}
        scrollRef={scroll}
        disabled={saving}
        blockUpdate={
          saving || JSON.stringify(draft) !== JSON.stringify(initial)
        }
      >
        <AppText variant="title" accessibilityRole="header">
          {sectionLabels[section]}
        </AppText>
        <ProfileFields
          section={section}
          draft={draft}
          errors={errors}
          onChange={setDraft}
        />
        {section === 'body' && errors.targetWeight && (
          <>
            <AppText tone="error">
              После изменения текущего веса проверьте цель.
            </AppText>
            <ProfileFields
              section="goal"
              draft={draft}
              errors={errors}
              onChange={setDraft}
            />
          </>
        )}
        {warnings.map((warning) => (
          <AppText key={warning} accessibilityRole="alert">
            {warning}
          </AppText>
        ))}
        {session?.failure && (
          <AppText tone="error" accessibilityRole="alert">
            {session.failure}
          </AppText>
        )}
        <PrimaryButton
          label={saving ? 'Сохраняем…' : 'Сохранить изменения'}
          disabled={saving}
          onPress={() => void save()}
        />
        <PrimaryButton
          label="Назад без сохранения"
          disabled={saving}
          onPress={() =>
            JSON.stringify(draft) === JSON.stringify(initial)
              ? onClose(false)
              : setDiscard(true)
          }
          secondary
        />
        {discard && (
          <Dialog
            title="Отменить изменения?"
            onDismiss={() => setDiscard(false)}
          >
            <AppText>Изменения этого раздела не будут сохранены.</AppText>
            <PrimaryButton
              label="Продолжить редактирование"
              onPress={() => setDiscard(false)}
            />
            <PrimaryButton
              label="Отменить изменения"
              onPress={() => onClose(false)}
              secondary
            />
          </Dialog>
        )}
      </FormScreen>
    </FieldFocusContext>
  );
}
