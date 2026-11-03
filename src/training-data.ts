export type WorkoutSet = { reps: number; weight_kg: number; done: boolean };
export type WorkoutExercise = { name: string; sets: WorkoutSet[] };
export type Workout = {
  id: string; user_id: string; title: string; notes: string; exercises: WorkoutExercise[];
  started_at: string; completed_at: string | null;
  spotify_track_id: string | null; spotify_track_name: string | null;
  spotify_artist: string | null; spotify_url: string | null;
};
export type WeightEntry = { id: string; user_id: string; weight_kg: number; recorded_at: string };

export function validateWorkout(title: string, notes: string, exercises: WorkoutExercise[]) {
  const name = title.trim();
  if (!name || name.length > 120 || notes.length > 2000 || exercises.length > 60) throw new Error('Check the workout title, notes, and exercise count.');
  for (const exercise of exercises) {
    if (!exercise.name.trim() || exercise.name.length > 120 || exercise.sets.length > 30) throw new Error('Each exercise needs a name and at most 30 sets.');
    for (const set of exercise.sets) {
      if (!Number.isInteger(set.reps) || set.reps < 0 || set.reps > 1000 || !Number.isFinite(set.weight_kg) || set.weight_kg < 0 || set.weight_kg > 10000) throw new Error('Sets need 0–1000 reps and 0–10000 kg.');
    }
  }
  return { title: name, notes, exercises };
}

export function personalRecords(workouts: Workout[]) {
  const records = new Map<string, { name: string; weight: number; reps: number; at: string }>();
  for (const workout of workouts) {
    if (!workout.completed_at || !Array.isArray(workout.exercises)) continue;
    for (const exercise of workout.exercises) {
      if (!exercise?.name || !Array.isArray(exercise.sets)) continue;
      for (const set of exercise.sets) {
        if (!set.done || set.reps < 1 || !Number.isFinite(set.weight_kg)) continue;
        const key = exercise.name.trim().toLocaleLowerCase();
        const old = records.get(key);
        if (!old || set.weight_kg > old.weight || (set.weight_kg === old.weight && set.reps > old.reps)) records.set(key, { name: exercise.name.trim(), weight: set.weight_kg, reps: set.reps, at: workout.completed_at });
      }
    }
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name));
}
