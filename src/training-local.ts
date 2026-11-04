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
export function suggestedWorkout(equipment: Equipment, goal: Goal) {
  const names = {
    bodyweight: ['Squat', 'Push-up', 'Reverse lunge', 'Glute bridge'],
    dumbbells: ['Goblet squat', 'Dumbbell row', 'Dumbbell floor press', 'Romanian deadlift'],
    barbell: ['Barbell squat', 'Barbell row', 'Bench press', 'Romanian deadlift'],
  }[equipment];
  const reps = goal === 'strength' ? 6 : 10;
  return {
    title: goal === 'strength' ? 'Strength session' : 'Full-body session',
    exercises: names.map(name => ({ name, sets: Array.from({ length: 3 }, () => ({ reps, weight_kg: 0, done: false })) })),
  };
}
