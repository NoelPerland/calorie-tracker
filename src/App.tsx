import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { dayKey, localInput, totals, formatNumber as n, type Entry } from './data';
import { validateFood } from '../supabase/functions/_shared/food';

const dateLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
function Brand() { return <div className="brand"><span className="brand-icon" aria-hidden="true">↗</span><span>Calorie<span className="font-normal text-muted"> Tracker</span></span></div>; }

function Auth() {
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
  return <main className="auth-shell"><Brand/><div className="auth-card"><span className="eyebrow">SMALL HABITS. REAL PROGRESS.</span><h1>Your day,<br/>in balance.</h1><p className="text-muted mb-8">A little clarity for everything you eat.</p>{!supabase ? <div className="notice"><h2>Connect your tracker</h2><p>Your tracker is deployed. Database setup is still in progress; meal logging will be available once it is connected.</p><p className="mt-3"><a className="text-button" href="https://github.com/NoelPerland/calorie-tracker#5-github-pages-deployment">Open setup instructions →</a></p><p className="text-xs">For local development, configure <code>.env.local</code>. For this hosted site, set the Supabase repository variables and rerun deployment.</p></div> : <><form onSubmit={submit} className="grid gap-4"><label>Email<input autoComplete="email" name="email" type="email" required placeholder="you@example.com"/></label><label>Password<input autoComplete={mode === 'login' ? 'current-password':'new-password'} name="password" type="password" minLength={8} required placeholder="At least 8 characters"/></label><button type="submit" className="primary mt-2" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in →':'Create account →'}</button><p role="status" className="text-sm">{message}</p></form><button type="button" className="text-button mt-4" onClick={()=>{setMode(mode === 'login'?'signup':'login');setMessage('');}}>{mode === 'login' ? 'New here? Create an account':'Already have an account? Sign in'}</button></>}</div><p className="auth-footer">YOUR NUTRITION. YOUR PACE.</p></main>;
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

function ChatDialog({onClose}:{onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current!;node.showModal();return()=>node.close();},[]);
  return <dialog ref={dialog} className="food-dialog" aria-label="Log food with ChatGPT" onCancel={onClose}><div className="flex justify-between items-start mb-6"><div><span className="eyebrow">AI FOOD LOGGING</span><h2>Tell ChatGPT.</h2></div><button type="button" aria-label="Close" className="icon-button" onClick={onClose}>×</button></div><p className="text-muted mb-6">Open a ChatGPT Work chat, choose <strong>@Calorie Tracker</strong>, and describe what you ate. ChatGPT estimates the nutrition and it appears here automatically.</p><div className="notice mb-6"><p>“I had two eggs, chicken bacon and baked beans for breakfast.”</p></div><a className="primary w-full text-center" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT ↗</a><p className="text-xs text-muted mt-4">First time only: connect the Calorie Tracker plugin to this account.</p></dialog>;
}

function FoodForm({entry,onClose,onSaved}:{entry:Entry;onClose:()=>void;onSaved:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{const node=dialog.current!;node.showModal();return ()=>node.close();},[]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const food = validateFood({name:form.get('name'), calories:Number(form.get('calories')),protein:Number(form.get('protein')),carbs:Number(form.get('carbs')),fat:Number(form.get('fat')),notes:form.get('notes'),eaten_at:new Date(String(form.get('eaten_at'))).toISOString(),source:entry?.source ?? 'manual'});
      const {data:{user},error:authError} = await supabase!.auth.getUser();
      if(authError || !user) throw new Error('Your session expired. Please sign in again.');
      const result = await supabase!.from('food_entries').update(food).eq('id',entry.id).select('id').single();
      if(result.error) throw result.error;
      onSaved();
    } catch(error) {setError(error instanceof Error ? error.message : 'Could not save this meal. Please try again.');}
    finally {setBusy(false);}
  }
  return <dialog ref={dialog} className="food-dialog" aria-label="Edit food" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}><div className="flex justify-between items-start mb-6"><div><span className="eyebrow">CORRECT THE ESTIMATE</span><h2>Edit food</h2></div><button aria-label="Close food form" className="icon-button" onClick={onClose} disabled={busy}>×</button></div><form onSubmit={submit}><fieldset disabled={busy} className="grid gap-4"><label>Food or meal name<input name="name" autoFocus required maxLength={200} defaultValue={entry.name}/></label><div className="grid grid-cols-2 gap-4">{(['calories','protein','carbs','fat'] as const).map(key=><label key={key} className="capitalize">{key} <span className="text-muted font-normal">{key==='calories'?'kcal':'g'}</span><input name={key} type="number" inputMode="decimal" min="0" max="100000" step={key==='calories'?'1':'any'} required defaultValue={entry[key]}/></label>)}</div><label>Date & time<input name="eaten_at" type="datetime-local" required defaultValue={localInput(new Date(entry.eaten_at))}/></label><label>Notes <span className="text-muted font-normal">optional</span><textarea name="notes" maxLength={2000} rows={2} defaultValue={entry.notes??''}/></label><p role="alert" className="error">{error}</p><button className="primary w-full">{busy?'Saving…':'Save changes'}</button></fieldset></form></dialog>;
}

function Tracker({session}:{session:Session}) {
  const [today,setToday] = useState(dayKey(new Date()));
  const [page,setPage] = useState<'today'|'history'>('today');
  const [selected,setSelected] = useState<string|null>(null);
  const [entries,setEntries] = useState<Entry[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [sync,setSync] = useState('Connecting');
  const [form,setForm] = useState<Entry|null>(null);
  const [chat,setChat] = useState(false);
  const [deleting,setDeleting] = useState<string|null>(null);
  const request = useRef(0);
  const refresh = useCallback(async()=>{
    const version = ++request.current;
    try {
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
  },[session.user.id]);
  useEffect(()=>{
    void refresh();
    const channel=supabase!.channel(`food-${session.user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'food_entries',filter:`user_id=eq.${session.user.id}`},()=>void refresh()).subscribe(status=>{setSync(status==='SUBSCRIBED'?'Live sync':'Sync reconnecting');if(status==='SUBSCRIBED')void refresh();});
    const onFocus=()=>{setToday(dayKey(new Date()));void refresh();};
    window.addEventListener('focus',onFocus);
    const timer=window.setInterval(()=>{setToday(dayKey(new Date()));void refresh();},60000);
    return ()=>{request.current++;void supabase!.removeChannel(channel);window.removeEventListener('focus',onFocus);clearInterval(timer);};
  },[refresh,session.user.id]);
  const day=page==='today'?today:selected;
  const dayEntries=entries.filter(e=>dayKey(new Date(e.eaten_at))===day);
  const sum=totals(dayEntries);
  const groups=Object.entries(entries.reduce<Record<string,Entry[]>>((acc,e)=>{const key=dayKey(new Date(e.eaten_at));(acc[key]??=[]).push(e);return acc;},{})).sort(([a],[b])=>b.localeCompare(a));
  const macroEnergy=sum.protein*4+sum.carbs*4+sum.fat*9;
  async function remove(entry:Entry) {
    if(!window.confirm(`Delete “${entry.name}”?`))return;
    setDeleting(entry.id);
    try {const {error}=await supabase!.from('food_entries').delete().eq('id',entry.id);if(error)throw error;await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not delete this entry.');}
    finally{setDeleting(null);}
  }
  return <div className="app-shell"><header className="topbar"><Brand/><div className="flex gap-4 items-center"><span className="sync"><i/>{sync}</span><button className="text-button" onClick={async()=>{const {error}=await supabase!.auth.signOut();if(error)setError(error.message);}}>Sign out</button></div></header><main className="dashboard"><nav className="tabs" aria-label="Main navigation"><button aria-current={page==='today'?'page':undefined} onClick={()=>{setPage('today');setSelected(null);}}>◉ <span>Today</span></button><button aria-current={page==='history'?'page':undefined} onClick={()=>{setPage('history');setSelected(null);}}>◷ <span>History</span></button></nav><div className="heading"><div><span className="eyebrow">YOUR DAILY CHECK-IN</span><h1>{page==='today'?'Today':selected?'Your day':'History'}<span className="accent">.</span></h1><p className="text-muted">{day?dateLabel(day):'A little perspective on your progress.'}</p></div>{day&&<button className="primary add-button" onClick={()=>setChat(true)}>✦ <span>Log with ChatGPT</span></button>}</div>{selected&&<button className="text-button mb-5" onClick={()=>setSelected(null)}>← All days</button>}{error&&<div role="alert" className="notice error mb-5">{error} <button className="text-button" onClick={()=>void refresh()}>Retry</button></div>}{loading?<div role="status" className="empty">Loading your nutrition…</div>:day?<><section className="summary" aria-label="Daily nutrition totals"><div className="calories-card"><div className="flex justify-between items-center"><span className="eyebrow">ENERGY IN</span><span className="energy-icon" aria-hidden="true">ϟ</span></div><div className="calorie-number">{n(sum.calories)}<span>kcal</span></div><div className="card-bottom"><span>Calories logged</span><span>{dayEntries.length} {dayEntries.length===1?'entry':'entries'}</span></div></div><div className="macro-card"><div className="macro-title">The building blocks<span className="text-muted text-xs">GRAMS</span></div><div className="macro-values">{(['protein','carbs','fat'] as const).map((key,i)=><div key={key}><span className={`macro-label macro-${i}`}><i/>{key}</span><strong>{n(sum[key])}<small>g</small></strong></div>)}</div><div className="macro-bar" aria-hidden="true">{[sum.protein*4,sum.carbs*4,sum.fat*9].map((v,i)=><span key={i} className={`segment-${i}`} style={{width:`${macroEnergy?v/macroEnergy*100:0}%`}}/>)}</div><p className="text-xs text-muted mt-3">{macroEnergy?'Your macro energy balance':'Your daily balance starts with one meal.'}</p></div></section><section className="meal-section"><div className="section-heading"><h2>{page==='today'?"Today’s food":'Food log'} <span className="count">{dayEntries.length}</span></h2><span className="text-xs text-muted">EARLIEST FIRST</span></div>{dayEntries.length===0?<div className="empty"><span className="empty-mark" aria-hidden="true">✦</span><h3>Tell ChatGPT what you ate.</h3><p>It will estimate the calories and macros<br/>and add the meal here automatically.</p><button className="text-button" onClick={()=>setChat(true)}>Log your first meal →</button></div>:<div className="meal-list">{dayEntries.map(entry=><article className="meal" key={entry.id}><div className="meal-symbol" aria-hidden="true">{entry.source==='chat'?'✧':'↗'}</div><div className="meal-content"><div className="flex gap-2 items-center flex-wrap"><h3>{entry.name}</h3>{entry.source==='chat'&&<span className="chat-badge">CHAT</span>}</div><p className="meal-meta"><time dateTime={entry.eaten_at}>{new Date(entry.eaten_at).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</time><span>·</span><span>P {n(Number(entry.protein))}g</span><span>C {n(Number(entry.carbs))}g</span><span>F {n(Number(entry.fat))}g</span></p>{entry.notes&&<p className="meal-note">{entry.notes}</p>}</div><div className="meal-energy"><strong>{n(entry.calories)}</strong><span>kcal</span></div><div className="meal-actions"><button aria-label={`Edit ${entry.name}`} onClick={()=>setForm(entry)}>Edit</button><button aria-label={`Delete ${entry.name}`} disabled={deleting===entry.id} onClick={()=>void remove(entry)}>{deleting===entry.id?'…':'Delete'}</button></div></article>)}</div>}</section><p className="footnote">Consistency over perfection. Estimates count, too.</p></>:<section className="history-list">{groups.length===0?<div className="empty"><h3>Your story starts today.</h3><p>Logged days will appear here.</p><button className="text-button" onClick={()=>setPage('today')}>Go to Today →</button></div>:groups.map(([key,items])=>{const t=totals(items);return <button className="history-day" key={key} onClick={()=>setSelected(key)}><div><h3>{key===today?'Today':dateLabel(key)}</h3><p className="text-muted text-sm">{items.length} entries · P {n(t.protein)}g · C {n(t.carbs)}g · F {n(t.fat)}g</p></div><div className="history-energy"><strong>{n(t.calories)}</strong><span> kcal →</span></div></button>;})}</section>}</main><footer className="site-footer"><Brand/><span>ONE MEAL AT A TIME.</span></footer>{chat&&<ChatDialog onClose={()=>setChat(false)}/>} {form&&<FoodForm entry={form} onClose={()=>setForm(null)} onSaved={()=>{setForm(null);void refresh();}}/>}</div>;
}

export default function App() {
  const [session,setSession]=useState<Session|null>(null);
  const [ready,setReady]=useState(!supabase);
  useEffect(()=>{
    if(!supabase)return;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setReady(true);});
    return ()=>subscription.unsubscribe();
  },[]);
  if(!ready)return <main className="auth-shell" role="status">Opening your tracker…</main>;
  const connecting=new URLSearchParams(location.search).has('authorization_id');
  return session?(connecting?<OAuthConsent/>:<Tracker key={session.user.id} session={session}/>):<Auth/>;
}



