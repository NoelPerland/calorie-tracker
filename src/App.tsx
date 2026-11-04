import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import Training from './Training';
import { spotifyTarget } from './spotify';
import { barcodeFood, dayKey, localInput, readGuestEntries, writeGuestEntries, totals, formatNumber as n, type Entry } from './data';
import { validateFood } from '../supabase/functions/_shared/food';

const dateLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
function Brand() { return <div className="brand"><span className="brand-icon" aria-hidden="true"><i/><i/><i/></span><span>Calorie<span className="font-normal text-muted"> Tracker</span></span></div>; }

function Auth({onGuest}:{onGuest:()=>void}) {
  const [mode,setMode] = useState<'login'|'signup'>('login');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const credentials = { email:String(form.get('email')).trim(), password:String(form.get('password')) };
      const result = mode === 'login' ? await supabase!.auth.signInWithPassword(credentials) : await supabase!.auth.signUp({ ...credentials, options:{emailRedirectTo:window.location.origin+import.meta.env.BASE_URL} });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) setMessage('Check your email to confirm your account, then sign in.');
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><div className="auth-hero"><Brand/><div className="auth-hero-copy"><p>NUTRITION / TRAINING</p><h2>Keep your day<br/>in view.</h2></div></div><div className="auth-card"><span className="eyebrow">YOUR ACCOUNT</span><h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1><p className="text-muted mb-8">Sync your meals and training across devices.</p>{!supabase ? <div className="notice"><h2>Account sync unavailable</h2><p>You can still log food on this device. To enable accounts, configure Supabase for this deployment.</p></div> : <><form onSubmit={submit} className="grid gap-4"><label>Email<input autoComplete="email" name="email" type="email" required placeholder="you@example.com"/></label><label>Password<input autoComplete={mode === 'login' ? 'current-password':'new-password'} name="password" type="password" minLength={8} required placeholder="At least 8 characters"/></label><button type="submit" className="primary mt-2" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in':'Create account'}</button><p role="status" className="text-sm">{message}</p></form><button type="button" className="text-button mt-4" onClick={()=>{setMode(mode === 'login'?'signup':'login');setMessage('');}}>{mode === 'login' ? 'Create an account':'Already have an account? Sign in'}</button></>}<button className="guest-link" type="button" onClick={onGuest}>Continue without an account <span aria-hidden="true">→</span></button></div></main>;
}

function OAuthConsent() {
  const authorizationId=new URLSearchParams(location.search).get('authorization_id');
  const [details,setDetails]=useState<{client:{name:string};scope:string;redirect_uri:string}|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(true);
  useEffect(()=>{void (async()=>{
    if(!authorizationId){setError('This connection request is missing its authorization ID.');setBusy(false);return;}
    const {data,error}=await supabase!.auth.oauth.getAuthorizationDetails(authorizationId);
    if(error){setError(error.message);setBusy(false);return;}
    if(data && !('authorization_id' in data)){location.assign(data.redirect_url);return;}
    setDetails(data as typeof details);setBusy(false);
  })();},[authorizationId]);
  async function decide(approve:boolean){
    if(!authorizationId)return;
    setBusy(true);setError('');
    const {data,error}=approve?await supabase!.auth.oauth.approveAuthorization(authorizationId):await supabase!.auth.oauth.denyAuthorization(authorizationId);
    if(error){setError(error.message);setBusy(false);return;}
    location.assign(data.redirect_url);
  }
  return <main className="auth-shell"><Brand/><div className="auth-card"><span className="eyebrow">CHATGPT CONNECTION</span><h1>Connect your<br/>food log.</h1>{busy&&!error?<p className="text-muted">Checking the connection…</p>:error?<div className="notice error">{error}</div>:details&&<><p className="text-muted mb-8"><strong>{details.client.name}</strong> wants permission to add meals to your Calorie Tracker account.</p>{details.scope&&<p className="text-xs text-muted mb-4">Requested access: {details.scope.split(' ').join(', ')}</p>}<div className="grid gap-3"><button type="button" className="primary" disabled={busy} onClick={()=>void decide(true)}>Connect ChatGPT →</button><button type="button" className="text-button" disabled={busy} onClick={()=>void decide(false)}>Cancel</button></div></>}</div><p className="auth-footer">YOU STAY IN CONTROL.</p></main>;
}

function AddFoodDialog({guest,onClose,onSave,onSaved}:{guest:boolean;onClose:()=>void;onSave:(food:ReturnType<typeof validateFood>)=>Promise<void>;onSaved:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const scanner=useRef<{stop:()=>Promise<void>;clear:()=>void}|null>(null);
  const processing=useRef(false);
  const [mode,setMode]=useState<'choose'|'manual'|'photo'|'barcode'>('choose');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  function stopScanner(){const current=scanner.current;scanner.current=null;if(!current)return;const clear=()=>{try{current.clear();}catch{}};try{void current.stop().catch(()=>{}).finally(clear);}catch{clear();}}
  useEffect(()=>{const node=dialog.current!;node.showModal();return()=>node.close();},[]);
  useEffect(()=>{if(mode!=='barcode')return;let cancelled=false;void (async()=>{try{const {Html5Qrcode}=await import('html5-qrcode');if(cancelled)return;const camera=new Html5Qrcode('barcode-reader');scanner.current=camera;await camera.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:140}},code=>{void foundBarcode(code);},()=>{});}catch{if(!cancelled)setMessage('Camera scanning is unavailable. Enter the barcode below.');}})();return()=>{cancelled=true;stopScanner();};},[mode]);
  async function save(food:ReturnType<typeof validateFood>){await onSave(food);onSaved();}
  async function saveManual(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage('');const form=new FormData(event.currentTarget);try{await save(validateFood({name:form.get('name'),calories:Number(form.get('calories')),protein:Number(form.get('protein')||0),carbs:Number(form.get('carbs')||0),fat:Number(form.get('fat')||0),notes:null,eaten_at:new Date().toISOString(),source:'manual'}));}catch(error){setMessage(error instanceof Error?error.message:'Could not save this meal.');setBusy(false);}}
  async function foundBarcode(raw:string){if(processing.current)return;const code=raw.replace(/\D/g,'');if(!code)return;processing.current=true;setBusy(true);setMessage('Looking up nutrition…');try{stopScanner();const response=await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,serving_size,nutriments`);if(!response.ok)throw new Error('Product lookup failed.');const food=validateFood(barcodeFood(await response.json(),code,new Date().toISOString()));await save(food);}catch(error){processing.current=false;setMessage(error instanceof Error?error.message:'Could not log this product.');setBusy(false);}}
  async function analyzePhoto(file:File){setBusy(true);setMessage('AI is estimating your meal…');try{if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>8_000_000)throw new Error('Use a JPG, PNG, or WebP photo under 8 MB.');const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read the photo.'));reader.readAsDataURL(file);});const {data,error}=await supabase!.functions.invoke('analyze-food-photo',{body:{image,eaten_at:new Date().toISOString()}});if(error)throw error;if(data?.error)throw new Error(data.error);onSaved();}catch(error){setMessage(error instanceof Error?error.message:'Could not analyze this meal.');setBusy(false);}}
  return <dialog ref={dialog} className="food-dialog" aria-label="Log food" onCancel={onClose}>
    <div className="dialog-heading"><div><span className="eyebrow">LOG FOOD</span><h2>{mode==='choose'?'Add a meal':mode==='manual'?'Quick add':mode==='photo'?'Take a photo':'Scan a barcode'}</h2></div><button type="button" aria-label="Close" className="icon-button" onClick={onClose}>×</button></div>
    {mode==='choose'?<div className="log-options">
      <button className="choice-button choice-primary" onClick={()=>setMode('manual')}><strong>Quick add <span aria-hidden="true">→</span></strong><span>Name and calories. Macros if you know them.</span></button>
      <button className="choice-button" onClick={()=>setMode('barcode')}><strong>Scan a barcode <span aria-hidden="true">→</span></strong><span>Nutrition from the package.</span></button>
      {!guest&&<button className="choice-button" onClick={()=>setMode('photo')}><strong>Take a photo <span aria-hidden="true">→</span></strong><span>Estimate a meal from an image.</span></button>}
      {!guest&&<a className="text-button" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Log with ChatGPT ↗</a>}
    </div>:mode==='manual'?<form className="quick-form" onSubmit={e=>void saveManual(e)}>
      <label>Food or meal<input name="name" autoFocus required maxLength={200} placeholder="e.g. Lunch" /></label>
      <label>Calories<input name="calories" type="number" inputMode="numeric" min="0" max="100000" step="1" required placeholder="0" /></label>
      <details className="more-nutrition"><summary>Add macros</summary><div className="macro-inputs"><label>Protein · g<input name="protein" type="number" inputMode="decimal" min="0" max="100000" step="any" placeholder="0"/></label><label>Carbs · g<input name="carbs" type="number" inputMode="decimal" min="0" max="100000" step="any" placeholder="0"/></label><label>Fat · g<input name="fat" type="number" inputMode="decimal" min="0" max="100000" step="any" placeholder="0"/></label></div></details>
      <button className="primary" disabled={busy}>{busy?'Saving…':'Save meal'}</button><p role="alert" className="error">{message}</p><button type="button" className="text-button" onClick={()=>setMode('choose')}>Other ways to log</button>
    </form>:mode==='photo'?<div className="grid gap-4"><p className="text-muted">Keep the whole meal in the frame.</p><label className="primary w-full text-center">{busy?'Analyzing…':'Open camera'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void analyzePhoto(file);}}/></label><p role="status" className={message&&!busy?'error':'text-muted'}>{message}</p><button className="text-button" onClick={()=>{setMode('choose');setMessage('');}}>Other ways to log</button></div>:<div className="grid gap-4"><div id="barcode-reader" className="barcode-reader"/><form onSubmit={e=>{e.preventDefault();void foundBarcode(String(new FormData(e.currentTarget).get('barcode')));}}><label>Or enter the barcode<input name="barcode" inputMode="numeric" pattern="[0-9 ]{7,18}" required placeholder="e.g. 7310865004703"/></label><button className="primary w-full mt-3" disabled={busy}>{busy?'Looking up…':'Look up product'}</button></form><p role="status" className="error">{message}</p><button className="text-button" onClick={()=>{setMode('choose');setMessage('');}}>Other ways to log</button></div>}
  </dialog>;
}
function FoodForm({entry,onClose,onSave,onSaved}:{entry:Entry;onClose:()=>void;onSave:(food:ReturnType<typeof validateFood>)=>Promise<void>;onSaved:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{const node=dialog.current!;node.showModal();return ()=>node.close();},[]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const food = validateFood({name:form.get('name'), calories:Number(form.get('calories')),protein:Number(form.get('protein')),carbs:Number(form.get('carbs')),fat:Number(form.get('fat')),notes:form.get('notes'),eaten_at:new Date(String(form.get('eaten_at'))).toISOString(),source:entry?.source ?? 'manual'});
      await onSave(food);
      onSaved();
    } catch(error) {setError(error instanceof Error ? error.message : 'Could not save this meal. Please try again.');}
    finally {setBusy(false);}
  }
  return <dialog ref={dialog} className="food-dialog" aria-label="Edit food" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <div className="dialog-heading"><div><span className="eyebrow">MEAL DETAILS</span><h2>Edit meal</h2></div><button type="button" aria-label="Close food form" className="icon-button" onClick={onClose} disabled={busy}>×</button></div>
    <form onSubmit={submit}><fieldset disabled={busy} className="quick-form"><label>Food or meal<input name="name" autoFocus required maxLength={200} defaultValue={entry.name}/></label><label>Calories<input name="calories" type="number" inputMode="numeric" min="0" max="100000" step="1" required defaultValue={entry.calories}/></label>
      <details className="more-nutrition"><summary>Macros</summary><div className="macro-inputs">{(['protein','carbs','fat'] as const).map(key=><label key={key} className="capitalize">{key} · g<input name={key} type="number" inputMode="decimal" min="0" max="100000" step="any" required defaultValue={entry[key]}/></label>)}</div></details>
      <details className="more-nutrition"><summary>Date & notes</summary><div className="more-fields"><label>Date & time<input name="eaten_at" type="datetime-local" required defaultValue={localInput(new Date(entry.eaten_at))}/></label><label>Notes <span className="text-muted font-normal">optional</span><textarea name="notes" maxLength={2000} rows={2} defaultValue={entry.notes??''}/></label></div></details>
      <p role="alert" className="error">{error}</p><button className="primary">{busy?'Saving…':'Save changes'}</button>
    </fieldset></form>
  </dialog>;
}
function Tracker({session,onAccount}:{session:Session|null;onAccount:()=>void}) {
  const [today,setToday] = useState(dayKey(new Date()));
  const [page,setPage] = useState<'today'|'history'>('today');
  const [trainingPage,setTrainingPage] = useState<'workouts'|'feed'|'prs'|'weight'|null>(()=>spotifyTarget()?'feed':null);
  const [trainingEditing,setTrainingEditing] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const navigate = (destination:typeof trainingPage) => { if(destination===null&&trainingEditing&&!window.confirm('Leave workout? Unsaved changes will be lost.'))return; setTrainingPage(destination); menu.current?.removeAttribute('open'); };
  const [selected,setSelected] = useState<string|null>(null);
  const [entries,setEntries] = useState<Entry[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [sync,setSync] = useState('Connecting');
  const [form,setForm] = useState<Entry|null>(null);
  const [adding,setAdding] = useState(false);
  const [deleting,setDeleting] = useState<string|null>(null);
  const [toast,setToast] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async()=>{
    const version = ++request.current;
    try {
      if(!session) {
        const local = readGuestEntries();
        if(version===request.current){setEntries(local);setError('');}
        return;
      }
      // ponytail: paginate the personal log in memory; move daily aggregation to SQL if it becomes large.
      const all:Entry[]=[];
      for(let from=0;;from+=1000) {
        const {data,error} = await supabase!.from('food_entries').select('*').eq('user_id',session.user.id).order('eaten_at').order('id').range(from,from+999);
        if(error) throw error;
        all.push(...data as Entry[]);
        if(data.length<1000) break;
      }
      if(version===request.current) {setEntries(all);setError('');}
    } catch(e) {if(version===request.current)setError(e instanceof Error?e.message:'Could not load your meals. Please retry.');}
    finally {if(version===request.current)setLoading(false);}
  },[session]);
  useEffect(()=>{
    void refresh();
    const channel=session?supabase!.channel(`food-${session.user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'food_entries',filter:`user_id=eq.${session.user.id}`},()=>void refresh()).subscribe(status=>{setSync(status==='SUBSCRIBED'?'Live sync':'Sync reconnecting');if(status==='SUBSCRIBED')void refresh();}):null;
    const onFocus=()=>{setToday(dayKey(new Date()));void refresh();};
    window.addEventListener('focus',onFocus);
    const timer=window.setInterval(()=>{setToday(dayKey(new Date()));void refresh();},60000);
    return ()=>{request.current++;if(channel)void supabase!.removeChannel(channel);window.removeEventListener('focus',onFocus);clearInterval(timer);};
  },[refresh,session]);
  const day=page==='today'?today:selected;
  const dayEntries=entries.filter(e=>dayKey(new Date(e.eaten_at))===day);
  const sum=totals(dayEntries);
  const groups=Object.entries(entries.reduce<Record<string,Entry[]>>((acc,e)=>{const key=dayKey(new Date(e.eaten_at));(acc[key]??=[]).push(e);return acc;},{})).sort(([a],[b])=>b.localeCompare(a));
  async function remove(entry:Entry) {
    if(!window.confirm(`Delete “${entry.name}”?`))return;
    setDeleting(entry.id);
    try {if(session){const {error}=await supabase!.from('food_entries').delete().eq('id',entry.id);if(error)throw error;}else writeGuestEntries(entries.filter(item=>item.id!==entry.id));await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not delete this entry.');}
    finally{setDeleting(null);}
  }
  async function saveFood(food:ReturnType<typeof validateFood>) {
    if(!session){writeGuestEntries([{...food,id:crypto.randomUUID(),user_id:'guest',created_at:new Date().toISOString()},...entries]);return;}
    const {data:{user}}=await supabase!.auth.getUser();
    if(!user)throw new Error('Your session expired. Please sign in again.');
    const {error}=await supabase!.from('food_entries').insert({...food,user_id:user.id});
    if(error)throw error;
  }
  async function editFood(entry:Entry,food:ReturnType<typeof validateFood>) {
    if(!session){writeGuestEntries(entries.map(item=>item.id===entry.id?{...item,...food}:item));return;}
    const {data:{user},error:authError}=await supabase!.auth.getUser();
    if(authError||!user)throw new Error('Your session expired. Please sign in again.');
    const {error}=await supabase!.from('food_entries').update(food).eq('id',entry.id).select('id').single();
    if(error)throw error;
  }
  function saved(message:string){setAdding(false);setForm(null);setToast(message);void refresh();}
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(timer);},[toast]);
  const inNutrition=!trainingPage;
  return <div className="app-shell">
    <header className="topbar"><Brand/><div className="topbar-actions"><span className="sync">{session?sync:'On this device'}</span><details className="account-menu" ref={menu}><summary aria-label="Open settings and account menu"><span aria-hidden="true">☰</span></summary><div className="menu-panel"><span className="eyebrow">ACCOUNT & MORE</span><p className="account-email">{session?session.user.email:'Guest · saved on this device'}</p><button onClick={()=>{navigate(null);setPage('today');setSelected(null);}}>Today</button><button onClick={()=>navigate('workouts')}>Workouts</button><button onClick={()=>navigate('feed')}>Workout feed</button><button onClick={()=>navigate('weight')}>Body weight</button><button onClick={()=>navigate('prs')}>Personal records</button>{session?<button onClick={async()=>{const {error}=await supabase!.auth.signOut();if(error)setError(error.message);}}>Sign out</button>:<button onClick={()=>{if(trainingEditing&&!window.confirm("Leave workout? Unsaved changes will be lost."))return;onAccount();}}>Sign in or create account</button>}</div></details></div></header>
    <main className="dashboard">
      {trainingPage?<Training page={trainingPage} session={session} onEditingChange={setTrainingEditing}/>:<>
        <nav className="tabs" aria-label="Nutrition navigation"><button aria-current={page==='today'?'page':undefined} onClick={()=>{setPage('today');setSelected(null);}}>Today</button><button aria-current={page==='history'?'page':undefined} onClick={()=>{setPage('history');setSelected(null);}}>History</button></nav>
        <div className="heading"><div><p className="eyebrow">NUTRITION</p><h1>{page==='today'?'Today':selected?'Food log':'History'}</h1><p className="text-muted">{day?dateLabel(day):'Your logged days'}</p></div></div>
        {page==='today'&&<div className="daily-actions"><button className="daily-action daily-action-food" onClick={()=>setAdding(true)}><span className="action-symbol" aria-hidden="true">+</span><span><strong>Log a meal</strong><small>Food, calories, done.</small></span><span aria-hidden="true">↗</span></button><button className="daily-action daily-action-workout" onClick={()=>navigate('workouts')}><span className="action-symbol" aria-hidden="true">↗</span><span><strong>Start a workout</strong><small>Sets, reps, progress.</small></span><span aria-hidden="true">↗</span></button></div>}
        {selected&&<button className="text-button back-days" onClick={()=>setSelected(null)}>← All days</button>}
        {error&&<div role="alert" className="notice error"><span>{error}</span><button className="text-button" onClick={()=>void refresh()}>Retry</button></div>}
        {loading?<div role="status" className="loading-state">Loading your meals…</div>:day?<><section className="daily-total" aria-label="Daily nutrition totals"><div className="daily-energy"><span>Calories logged</span><strong>{n(sum.calories)} <small>kcal</small></strong></div><details className="nutrition-details"><summary>Protein & macros <span aria-hidden="true">+</span></summary><div className="macro-values">{(['protein','carbs','fat'] as const).map(key=><div key={key}><span className="macro-label">{key}</span><strong>{n(sum[key])}<small>g</small></strong></div>)}</div></details></section><section className="meal-section"><div className="section-heading"><h2>{page==='today'?'Meals':'Meals that day'}</h2><span className="count">{dayEntries.length}</span></div>{dayEntries.length===0?<div className="empty"><h3>No meals yet.</h3><p>Your meals will appear here when you log them.</p></div>:<div className="meal-list">{[...dayEntries].reverse().map(entry=><article className="meal" key={entry.id}><div className="meal-content"><div className="meal-name"><h3>{entry.name}</h3>{entry.source==='chat'&&<span className="chat-badge">CHAT</span>}</div><p className="meal-meta"><time dateTime={entry.eaten_at}>{new Date(entry.eaten_at).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</time><span>Protein {n(Number(entry.protein))}g</span></p>{entry.notes&&<p className="meal-note">{entry.notes}</p>}</div><div className="meal-energy"><strong>{n(entry.calories)}</strong><span>kcal</span></div><details className="meal-menu"><summary aria-label={`More options for ${entry.name}`}>···</summary><div><button onClick={()=>setForm(entry)}>Edit</button><button disabled={deleting===entry.id} onClick={()=>void remove(entry)}>{deleting===entry.id?'Deleting…':'Delete'}</button></div></details></article>)}</div>}</section></>:<section className="history-list">{groups.length===0?<div className="empty"><h3>No history yet.</h3><p>Your logged days will appear here.</p><button className="text-button" onClick={()=>setPage('today')}>Back to today →</button></div>:groups.map(([key,items])=>{const t=totals(items);return <button className="history-day" key={key} onClick={()=>setSelected(key)}><div><h3>{key===today?'Today':dateLabel(key)}</h3><p>{items.length} {items.length===1?'meal':'meals'} · Protein {n(t.protein)}g</p></div><div className="history-energy"><strong>{n(t.calories)}</strong><span>kcal →</span></div></button>;})}</section>}
      </>}
    </main>
    <nav className="mobile-nav" aria-label="Primary navigation"><button aria-current={inNutrition&&page==='today'?'page':undefined} onClick={()=>{navigate(null);setPage('today');setSelected(null);}}>Today</button><button aria-current={inNutrition&&page==='history'?'page':undefined} onClick={()=>{navigate(null);setPage('history');setSelected(null);}}>History</button><button className="mobile-log" aria-label="Log food" onClick={()=>setAdding(true)}><span>+</span>Log food</button><button aria-current={trainingPage==='workouts'?'page':undefined} onClick={()=>navigate('workouts')}>Train</button><button aria-current={trainingPage==='weight'?'page':undefined} onClick={()=>navigate('weight')}>Progress</button></nav>
    {toast&&<div className="toast" role="status">{toast}</div>}
    {adding&&<AddFoodDialog guest={!session} onClose={()=>setAdding(false)} onSave={saveFood} onSaved={()=>saved('Meal saved')}/>}
    {form&&<FoodForm entry={form} onClose={()=>setForm(null)} onSave={food=>editFood(form,food)} onSaved={()=>saved('Meal updated')}/>}
  </div>;
}
export default function App() {
  const [session,setSession]=useState<Session|null>(null);
  const [showAuth,setShowAuth]=useState(false);
  const [ready,setReady]=useState(!supabase);
  useEffect(()=>{
    if(!supabase)return;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);if(next)setShowAuth(false);setReady(true);});
    return ()=>subscription.unsubscribe();
  },[]);
  if(!ready)return <main className="auth-shell" role="status">Opening your tracker…</main>;
  const connecting=new URLSearchParams(location.search).has('authorization_id');
  return session&&connecting?<OAuthConsent/>:!session&&showAuth?<Auth onGuest={()=>setShowAuth(false)}/>:<Tracker key={session?.user.id??'guest'} session={session} onAccount={()=>setShowAuth(true)}/>;
}



