import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLocalTraining, writeLocalTraining, readEquipment, readMuscles, suggestedWorkout } from '../src/training-local';

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
  const session = suggestedWorkout(['dumbbells', 'barbell'], 'strength', ['chest', 'back']);
  assert.ok(session.exercises.some(exercise => /dumbbell/i.test(exercise.name)));
  assert.ok(session.exercises.some(exercise => /barbell|bench press/i.test(exercise.name)));
  assert.ok(session.exercises.every(exercise => /press|row|hold/i.test(exercise.name)));
  assert.equal(session.exercises[0].sets[0].reps, 6);
  assert.equal(suggestedWorkout(['bodyweight'], 'general').exercises[0].sets[0].reps, 10);
  assert.equal(suggestedWorkout([], 'general').exercises.length, 0);
});

test('equipment preferences migrate and muscle choices stay scoped to the user', () => {
  const storage = new Map<string, string>([['calorie-tracker-equipment-guest', 'dumbbells'], ['calorie-tracker-muscles-guest', '["chest","back"]']]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } } as Storage;
  assert.deepEqual(readEquipment('guest'), ['dumbbells']);
  assert.deepEqual(readMuscles('guest'), ['chest', 'back']);
  assert.deepEqual(readMuscles('account-1'), []);
  storage.set('calorie-tracker-equipment-guest', '["barbell","dumbbells","unknown"]');
  assert.deepEqual(readEquipment('guest'), ['dumbbells', 'barbell']);
});
