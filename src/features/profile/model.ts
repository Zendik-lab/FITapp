export type GoalKind = 'gain' | 'maintain' | 'lose';
export type ActivityLevel =
  'minimal' | 'low' | 'moderate' | 'high' | 'veryHigh';
export type TrainingType = 'strength' | 'cardio' | 'mixed' | 'other';
export type Experience = 'beginner' | 'intermediate' | 'experienced';
export type ProfileSection =
  'personal' | 'body' | 'goal' | 'activity' | 'training' | 'nutrition';

export interface ProfileDraft {
  name: string;
  birthDate: string;
  sex: '' | 'male' | 'female' | 'unspecified';
  height: string;
  currentWeight: string;
  goal: '' | GoalKind;
  targetWeight: string;
  paceMode: 'recommended' | 'custom';
  pace: string;
  activity: '' | ActivityLevel;
  sessions: string;
  trainingType: '' | TrainingType;
  experience: '' | Experience;
  meals: string;
  diet: string;
  excludedFoods: string;
  allergies: string;
  restrictions: string;
}

export interface UserProfile {
  personal: {
    name: string;
    birthDate: string;
    sex: Exclude<ProfileDraft['sex'], ''>;
  };
  body: { heightCm: number; currentWeightKg: number };
  goals: {
    kind: GoalKind;
    targetWeightKg: number;
    paceMode: ProfileDraft['paceMode'];
    paceKgPerWeek: number;
  };
  activity: { level: ActivityLevel };
  training: {
    sessionsPerWeek: number;
    type: TrainingType | null;
    experience: Experience | null;
  };
  nutrition: {
    mealsPerDay: number | null;
    diet: string;
    excludedFoods: string;
    allergies: string;
    restrictions: string;
  };
}

export interface UserState {
  version: 1;
  profile: UserProfile | null;
  onboarding: { completed: boolean; step: number; draft: ProfileDraft };
}

export const emptyDraft: ProfileDraft = {
  name: '',
  birthDate: '',
  sex: '',
  height: '',
  currentWeight: '',
  goal: '',
  targetWeight: '',
  paceMode: 'recommended',
  pace: '0,25',
  activity: '',
  sessions: '',
  trainingType: '',
  experience: '',
  meals: '3',
  diet: '',
  excludedFoods: '',
  allergies: '',
  restrictions: '',
};

export function initialUserState(): UserState {
  return {
    version: 1,
    profile: null,
    onboarding: { completed: false, step: 0, draft: { ...emptyDraft } },
  };
}

export function profileToDraft(profile: UserProfile): ProfileDraft {
  return {
    name: profile.personal.name,
    birthDate: profile.personal.birthDate,
    sex: profile.personal.sex,
    height: String(profile.body.heightCm),
    currentWeight: String(profile.body.currentWeightKg),
    goal: profile.goals.kind,
    targetWeight: String(profile.goals.targetWeightKg),
    paceMode: profile.goals.paceMode,
    pace: String(profile.goals.paceKgPerWeek),
    activity: profile.activity.level,
    sessions: String(profile.training.sessionsPerWeek),
    trainingType: profile.training.type ?? '',
    experience: profile.training.experience ?? '',
    meals:
      profile.nutrition.mealsPerDay === null
        ? ''
        : String(profile.nutrition.mealsPerDay),
    diet: profile.nutrition.diet,
    excludedFoods: profile.nutrition.excludedFoods,
    allergies: profile.nutrition.allergies,
    restrictions: profile.nutrition.restrictions,
  };
}
