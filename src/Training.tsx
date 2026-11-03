import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { dayKey, localInput, formatNumber as n } from './data';
import { personalRecords, validateWorkout, type Workout, type WorkoutExercise, type WeightEntry } from './training-data';
import { connectSpotify, searchSpotify, spotifyConfigured, spotifyConnected, spotifyTarget, type SpotifyTrack } from './spotify';

type Page = 'workouts' | 'feed' | 'prs' | 'weight';
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export default function Training({ page, session }: { page: Page; session: Session }) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => { try { const message = sessionStorage.getItem('spotify_error') ?? ''; sessionStorage.removeItem('spotify_error'); return message; } catch { return ''; } });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; notes: string; exercises: WorkoutExercise[] } | null>(null);
  const [exerciseName, setExerciseName] = useState('');
  const [songWorkout, setSongWorkout] = useState<string | null>(spotifyTarget);
  const [songQuery, setSongQuery] = useState('');
  const [songs, setSongs] = useState<SpotifyTrack[]>([]);

  const load = useCallback(async () => {
    try {
      const fetchAll = async (table: 'workout_sessions' | 'weight_entries', column: string) => {
        const rows: unknown[] = [];
        for (let from = 0;; from += 500) {
          const { data, error } = await supabase!.from(table).select('*').eq('user_id', session.user.id).order(column, { ascending: false }).range(from, from + 499);
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) return rows;
        }
      };
      const [sessions, history] = await Promise.all([fetchAll('workout_sessions', 'started_at'), fetchAll('weight_entries', 'recorded_at')]);
      setWorkouts(sessions as Workout[]);
      setWeights(history as WeightEntry[]);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load training data.'); }
    finally { setLoading(false); }
  }, [session.user.id]);

  useEffect(() => {
    void load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  async function start(source?: Workout) {
    setBusy(true); setError('');
    try {
      const values = source ? { title: source.title, notes: '', exercises: source.exercises.map(exercise => ({ name: exercise.name, sets: exercise.sets.map(set => ({ reps: set.reps, weight_kg: set.weight_kg, done: false })) })) } : { title: 'New workout', notes: '', exercises: [] };
      const { data, error } = await supabase!.from('workout_sessions').insert(values).select('*').single();
      if (error) throw error;
      setWorkouts([data as Workout, ...workouts]);
      setCurrentId(data.id); setDraft(values);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start workout.'); }
    finally { setBusy(false); }
  }

  function edit(workout: Workout) {
    setCurrentId(workout.id);
    setDraft({ title: workout.title, notes: workout.notes, exercises: structuredClone(workout.exercises) });
    setError('');
  }

  function changeExercise(index: number, exercise: WorkoutExercise) {
    setDraft(old => old && { ...old, exercises: old.exercises.map((item, i) => i === index ? exercise : item) });
  }

  async function save(complete: boolean) {
    if (!draft || !currentId) return;
    setBusy(true); setError('');
    try {
      const values = validateWorkout(draft.title, draft.notes, draft.exercises);
      if (complete && !values.exercises.some(exercise => exercise.sets.some(set => set.done && set.reps > 0))) throw new Error('Complete at least one set before finishing.');
      const { error } = await supabase!.from('workout_sessions').update({ ...values, ...(complete ? { completed_at: new Date().toISOString() } : {}) }).eq('id', currentId).eq('user_id', session.user.id).select('id').single();
      if (error) throw error;
      await load();
      if (complete) { setCurrentId(null); setDraft(null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save workout.'); }
    finally { setBusy(false); }
  }

  async function addWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const form = new FormData(event.currentTarget);
      const weight = Number(form.get('weight'));
      const recorded = new Date(String(form.get('recorded_at')));
      if (!Number.isFinite(weight) || weight < 20 || weight > 500 || Number.isNaN(recorded.getTime())) throw new Error('Enter a weight from 20 to 500 kg and a valid date.');
      const { error } = await supabase!.from('weight_entries').insert({ weight_kg: weight, recorded_at: recorded.toISOString() });
      if (error) throw error;
      event.currentTarget.reset(); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not log weight.'); }
    finally { setBusy(false); }
  }

  async function findSongs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const query = songQuery.trim();
      if (!query || query.length > 100) throw new Error('Enter a song or artist, up to 100 characters.');
      setSongs(await searchSpotify(query));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Spotify search failed.'); }
    finally { setBusy(false); }
  }

  async function attachSong(track: SpotifyTrack) {
    if (!songWorkout) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase!.from('workout_sessions').update({ spotify_track_id: track.id, spotify_track_name: track.name.slice(0, 300), spotify_artist: track.artist.slice(0, 300), spotify_url: track.url }).eq('id', songWorkout).eq('user_id', session.user.id).not('completed_at', 'is', null).select('id').single();
      if (error) throw error;
      sessionStorage.removeItem('spotify_target'); setSongWorkout(null); setSongs([]); setSongQuery(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not attach song.'); }
    finally { setBusy(false); }
  }

  async function removeWorkout(workout: Workout) {
    if (!window.confirm(`Delete ${workout.title}? This also removes its PRs and feed entry.`)) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase!.from('workout_sessions').delete().eq('id', workout.id).eq('user_id', session.user.id).select('id').single();
      if (error) throw error;
      if (workout.id === currentId) { setCurrentId(null); setDraft(null); }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete workout.'); }
    finally { setBusy(false); }
  }

  async function removeWeight(entry: WeightEntry) {
    if (!window.confirm(`Delete ${n(Number(entry.weight_kg))} kg from ${date(entry.recorded_at)}?`)) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase!.from('weight_entries').delete().eq('id', entry.id).eq('user_id', session.user.id).select('id').single();
      if (error) throw error;
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete weight.'); }
    finally { setBusy(false); }
  }

  const active = workouts.find(workout => workout.id === currentId && !workout.completed_at);
  const unfinished = workouts.filter(workout => !workout.completed_at);
  const completed = workouts.filter(workout => workout.completed_at);
  const records = personalRecords(workouts);
  const heading = { workouts: 'Workouts', feed: 'Your feed', prs: 'Personal records', weight: 'Body weight' }[page];
  return <section className="training"><div className="heading"><div><h1>{heading}<span className="accent">.</span></h1></div></div>
    {error && <div role="alert" className="notice error mb-5">{error} <button className="text-button" onClick={() => void load()}>Retry</button></div>}
    {loading ? <div role="status" className="empty">Loading your training…</div> : page === 'workouts' ? <>
      {!draft && <><button className="primary" disabled={busy} onClick={() => void start()}>+ Start workout</button>{unfinished.length > 0 && <section className="training-block"><h2>In progress</h2><div className="training-list">{unfinished.map(workout => <article className="training-card" key={workout.id}><div><h3>{workout.title}</h3><p>{date(workout.started_at)}</p></div><button className="text-button" onClick={() => edit(workout)}>Resume →</button></article>)}</div></section>}{completed.length > 0 && <section className="training-block"><h2>Repeat a completed workout</h2><div className="training-list">{completed.slice(0, 20).map(workout => <article className="training-card" key={workout.id}><div><h3>{workout.title}</h3><p>{date(workout.completed_at!)} · {workout.exercises.length} exercises</p></div><button className="text-button" disabled={busy} onClick={() => void start(workout)}>Use again →</button></article>)}</div></section>}</>}
      {draft && active && <div className="workout-editor"><div className="training-block"><label>Workout name<input maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label><label>Notes<textarea maxLength={2000} rows={2} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })}/></label></div>{draft.exercises.map((exercise, index) => <section className="training-block exercise-card" key={index}><div className="section-heading"><h2>{exercise.name}</h2><button className="text-button" onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((_, i) => i !== index) })}>Remove</button></div><div className="set-head"><span>SET</span><span>KG</span><span>REPS</span><span>DONE</span></div>{exercise.sets.map((set, setIndex) => <div className="set-row" key={setIndex}><span>{setIndex + 1}</span><input aria-label={`${exercise.name} set ${setIndex + 1} weight in kg`} type="number" min="0" max="10000" step="0.25" value={set.weight_kg} onChange={event => changeExercise(index, { ...exercise, sets: exercise.sets.map((item, i) => i === setIndex ? { ...item, weight_kg: Number(event.target.value) } : item) })}/><input aria-label={`${exercise.name} set ${setIndex + 1} reps`} type="number" min="0" max="1000" step="1" value={set.reps} onChange={event => changeExercise(index, { ...exercise, sets: exercise.sets.map((item, i) => i === setIndex ? { ...item, reps: Number(event.target.value) } : item) })}/><input aria-label={`${exercise.name} set ${setIndex + 1} done`} type="checkbox" checked={set.done} onChange={event => changeExercise(index, { ...exercise, sets: exercise.sets.map((item, i) => i === setIndex ? { ...item, done: event.target.checked } : item) })}/></div>)}<button className="text-button" onClick={() => changeExercise(index, { ...exercise, sets: [...exercise.sets, { weight_kg: exercise.sets.at(-1)?.weight_kg ?? 0, reps: exercise.sets.at(-1)?.reps ?? 8, done: false }] })}>+ Add set</button></section>)}<form className="training-block add-exercise" onSubmit={event => { event.preventDefault(); const name = exerciseName.trim(); if (!name || name.length > 120) return; setDraft({ ...draft, exercises: [...draft.exercises, { name, sets: [{ weight_kg: 0, reps: 8, done: false }] }] }); setExerciseName(''); }}><label>Exercise<input maxLength={120} value={exerciseName} onChange={event => setExerciseName(event.target.value)} placeholder="e.g. Barbell bench press" required/></label><button className="primary">Add exercise</button></form><div className="editor-actions"><button className="text-button" disabled={busy} onClick={() => { if (window.confirm("Close workout? Unsaved changes will be lost.")) { setDraft(null); setCurrentId(null); } }}>Close</button><button className="text-button" disabled={busy} onClick={() => void removeWorkout(active)}>Discard</button><button className="text-button" disabled={busy} onClick={() => void save(false)}>Save progress</button><button className="primary" disabled={busy} onClick={() => void save(true)}>Finish workout</button></div></div>}
    </> : page === 'feed' ? <div className="training-list">{completed.length === 0 ? <div className="empty">Finish a workout to start your feed.</div> : completed.map(workout => <article className="feed-card" key={workout.id}><span className="eyebrow">COMPLETED · {date(workout.completed_at!)}</span><h2>{workout.title}</h2><p>{workout.exercises.length} exercises · {workout.exercises.reduce((count, exercise) => count + exercise.sets.filter(set => set.done).length, 0)} completed sets</p>{workout.notes && <p className="feed-note">{workout.notes}</p>}<ul>{workout.exercises.map((exercise, index) => <li key={index}>{exercise.name} · {exercise.sets.filter(set => set.done).length} sets</li>)}</ul>{workout.spotify_url && <p className="spotify-credit">♪ <a href={workout.spotify_url} target="_blank" rel="noreferrer">{workout.spotify_track_name} — {workout.spotify_artist} on Spotify ↗</a></p>}<button className="text-button" onClick={() => { setSongWorkout(workout.id); setSongs([]); setSongQuery(''); }}>{workout.spotify_url ? 'Change song' : '+ Add a Spotify song'}</button><button className="text-button delete-action" disabled={busy} onClick={() => void removeWorkout(workout)}>Delete workout</button>{songWorkout === workout.id && <div className="song-picker">{!spotifyConfigured ? <p>Spotify Client ID is needed before song search can connect.</p> : !spotifyConnected() ? <button className="primary" onClick={() => void connectSpotify(workout.id).catch(cause => setError(cause.message))}>Connect Spotify</button> : <><form onSubmit={event => void findSongs(event)}><label>Search Spotify<input maxLength={100} value={songQuery} onChange={event => setSongQuery(event.target.value)} placeholder="Song or artist"/></label><button className="primary" disabled={busy}>Search</button></form><div className="song-results">{songs.map(track => <button key={track.id} disabled={busy} onClick={() => void attachSong(track)}><strong>{track.name}</strong><span>{track.artist}</span></button>)}</div></>}<button className="text-button" onClick={() => setSongWorkout(null)}>Cancel</button></div>}</article>)}</div> : page === 'prs' ? <div className="training-list">{records.length === 0 ? <div className="empty">Complete a set to see your first PR.</div> : records.map(record => <article className="training-card" key={record.name}><div><h3>{record.name}</h3><p>{date(record.at)} · {record.reps} reps</p></div><strong>{n(record.weight)} kg</strong></article>)}</div> : <><form className="training-block weight-form" onSubmit={event => void addWeight(event)}><label>Weight in kg<input name="weight" type="number" min="20" max="500" step="0.1" required placeholder="e.g. 75.5"/></label><label>Date and time<input name="recorded_at" type="datetime-local" required defaultValue={localInput(new Date())}/></label><button className="primary" disabled={busy}>Log weight</button></form><div className="training-list">{weights.length === 0 ? <div className="empty">Your weight history starts with one entry.</div> : weights.map(entry => <article className="training-card" key={entry.id}><div><h3>{n(Number(entry.weight_kg))} kg</h3><p>{date(entry.recorded_at)}</p></div><button className="text-button" disabled={busy} onClick={() => void removeWeight(entry)}>Delete</button></article>)}</div></>}
  </section>;
}
