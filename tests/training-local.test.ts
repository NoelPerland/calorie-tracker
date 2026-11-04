import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLocalTraining, writeLocalTraining, suggestedWorkout } from '../src/training-local';

test('guest training is stored separately from account routines', () => {
  const storage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
  } as Storage;
  const guest = { workouts: [], weights: [{ id: 'weight-1', user_id: 'guest', weight_kg: 75, recorded_at: new Date().toISOString() }], routines: [] };
  writeLocalTraining('guest', guest);
  assert.equal(readLocalTraining('guest').weights.length, 1);
  assert.equal(readLocalTraining('account-1').weights.length, 0);
  storage.set('calorie-tracker-training-guest', '{"workouts":"broken"}');
  assert.throws(() => readLocalTraining('guest'));
});

test('suggestions reflect equipment and goal without pretending to personalize', () => {
  const session = suggestedWorkout('dumbbells', 'strength');
  assert.match(session.exercises[0].name, /dumbbell|goblet/i);
  assert.equal(session.exercises[0].sets[0].reps, 6);
  assert.equal(suggestedWorkout('bodyweight', 'general').exercises[0].sets[0].reps, 10);
});
