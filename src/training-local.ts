import { validateWorkout, type Workout, type WorkoutExercise, type WeightEntry } from './training-data';

export type Routine = { id: string; title: string; exercises: WorkoutExercise[] };
type LocalTraining = { workouts: Workout[]; weights: WeightEntry[]; routines: Routine[] };
const key = (scope: string) => `calorie-tracker-training-${scope}`;

export function readLocalTraining(scope: string): LocalTraining {
  const raw = JSON.parse(localStorage.getItem(key(scope)) || '{}') as Partial<LocalTraining>;
  if (!raw || typeof raw !== 'object') throw new Error('Could not read training saved on this device.');
  const workouts = (raw.workouts ?? []).map(workout => {
    const values = validateWorkout(workout.title, workout.notes, workout.exercises);
    if (!workout.id || !Number.isFinite(Date.parse(workout.started_at))) throw new Error('Could not read training saved on this device.');
    return { ...workout, ...values };
  });
  const weights = (raw.weights ?? []).filter(entry => entry.id && Number.isFinite(Number(entry.weight_kg)) && Number.isFinite(Date.parse(entry.recorded_at)));
  const routines = (raw.routines ?? []).map(routine => ({ id: routine.id, ...validateWorkout(routine.title, '', routine.exercises) }));
  return { workouts, weights, routines };
}

export function writeLocalTraining(scope: string, value: LocalTraining) {
  localStorage.setItem(key(scope), JSON.stringify(value));
}

export type Equipment = 'bodyweight' | 'dumbbells' | 'barbell';
export type Goal = 'strength' | 'general';
export type Muscle = 'chest' | 'back' | 'shoulders' | 'legs' | 'arms' | 'core';
export const equipmentOptions: Equipment[] = ['bodyweight', 'dumbbells', 'barbell'];
export const muscleOptions: Muscle[] = ['chest', 'back', 'shoulders', 'legs', 'arms', 'core'];
export const exerciseOptions: { name: string; equipment: Equipment; muscle: Muscle }[] = [
  { name: 'Push-up', equipment: 'bodyweight', muscle: 'chest' },
  { name: 'Dumbbell floor press', equipment: 'dumbbells', muscle: 'chest' },
  { name: 'Bench press', equipment: 'barbell', muscle: 'chest' },
  { name: 'Superman hold', equipment: 'bodyweight', muscle: 'back' },
  { name: 'Dumbbell row', equipment: 'dumbbells', muscle: 'back' },
  { name: 'Barbell row', equipment: 'barbell', muscle: 'back' },
  { name: 'Pike push-up', equipment: 'bodyweight', muscle: 'shoulders' },
  { name: 'Dumbbell shoulder press', equipment: 'dumbbells', muscle: 'shoulders' },
  { name: 'Barbell overhead press', equipment: 'barbell', muscle: 'shoulders' },
  { name: 'Squat', equipment: 'bodyweight', muscle: 'legs' },
  { name: 'Goblet squat', equipment: 'dumbbells', muscle: 'legs' },
  { name: 'Barbell squat', equipment: 'barbell', muscle: 'legs' },
  { name: 'Close-grip push-up', equipment: 'bodyweight', muscle: 'arms' },
  { name: 'Dumbbell curl', equipment: 'dumbbells', muscle: 'arms' },
  { name: 'Barbell curl', equipment: 'barbell', muscle: 'arms' },
  { name: 'Plank', equipment: 'bodyweight', muscle: 'core' },
  { name: 'Dumbbell side bend', equipment: 'dumbbells', muscle: 'core' },
  { name: 'Barbell rollout', equipment: 'barbell', muscle: 'core' },
];

export function readEquipment(scope: string): Equipment[] {
  try {
    const raw = localStorage.getItem(`calorie-tracker-equipment-${scope}`);
    const values = raw?.startsWith('[') ? JSON.parse(raw) : raw ? [raw] : ['bodyweight'];
    return Array.isArray(values) ? equipmentOptions.filter(option => values.includes(option)) : ['bodyweight'];
  } catch { return ['bodyweight']; }
}

export function readMuscles(scope: string): Muscle[] {
  try {
    const values = JSON.parse(localStorage.getItem(`calorie-tracker-muscles-${scope}`) ?? '[]');
    return Array.isArray(values) ? muscleOptions.filter(option => values.includes(option)) : [];
  } catch { return []; }
}

export function suggestedWorkout(equipment: Equipment[], goal: Goal, muscles: Muscle[] = []) {
  const targets = muscles.length ? muscleOptions.filter(muscle => muscles.includes(muscle)) : muscleOptions;
  const names: string[] = [];
  const rounds = targets.length <= 2 ? 3 : targets.length <= 3 ? 2 : 1;
  for (let round = 0; round < rounds; round++) for (const [index, muscle] of targets.entries()) {
    const available = exerciseOptions.filter(option => option.muscle === muscle && equipment.includes(option.equipment) && !names.includes(option.name));
    const preferred = equipment[(index + round) % equipment.length];
    const exercise = available.find(option => option.equipment === preferred) ?? available[0];
    if (exercise) names.push(exercise.name);
    if (names.length >= 6) break;
  }
  const reps = goal === 'strength' ? 6 : 10;
  return {
    title: muscles.length ? `${targets.map(muscle => muscle[0].toUpperCase() + muscle.slice(1)).join(' + ')} session` : 'Full-body session',
    exercises: names.map(name => ({ name, sets: Array.from({ length: 3 }, () => ({ reps, weight_kg: 0, done: false })) })),
  };
}
