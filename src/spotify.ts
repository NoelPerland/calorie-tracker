export type SpotifyTrack = { id: string; name: string; artist: string; url: string };

const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const redirectUri = () => window.location.origin + import.meta.env.BASE_URL;
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');

export const spotifyConfigured = Boolean(clientId);
export const spotifyTarget = () => { try { return sessionStorage.getItem('spotify_target'); } catch { return null; } };
export const spotifyConnected = () => {
  try {
    const saved = sessionStorage.getItem('spotify_token');
    if (!saved) return false;
    const token = JSON.parse(saved) as { expires: number };
    return token.expires > Date.now() + 30_000;
  } catch { return false; }
};

export async function connectSpotify(workoutId: string) {
  if (!clientId) throw new Error('Spotify Client ID is not configured.');
  const verifier = random() + random();
  const state = random();
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  sessionStorage.setItem('spotify_verifier', verifier);
  sessionStorage.setItem('spotify_state', state);
  sessionStorage.setItem('spotify_target', workoutId);
  const url = new URL('https://accounts.spotify.com/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri(), state, code_challenge_method: 'S256', code_challenge: challenge }).toString();
  window.location.assign(url.toString());
}

export async function finishSpotifyConnection() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('state')) return false;
  history.replaceState(null, '', window.location.pathname + window.location.hash);
  const state = sessionStorage.getItem('spotify_state');
  const verifier = sessionStorage.getItem('spotify_verifier');
  sessionStorage.removeItem('spotify_state');
  sessionStorage.removeItem('spotify_verifier');
  if (!state || params.get('state') !== state || !verifier) throw new Error('Spotify connection did not match this browser session.');
  if (params.has('error')) throw new Error('Spotify connection was cancelled.');
  const code = params.get('code');
  if (!code || !clientId) throw new Error('Spotify connection is missing its authorization code.');
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier }) });
  if (!response.ok) throw new Error('Spotify could not complete the connection.');
  const token = await response.json() as { access_token: string; expires_in: number };
  sessionStorage.setItem('spotify_token', JSON.stringify({ value: token.access_token, expires: Date.now() + token.expires_in * 1000 }));
  return true;
}

export async function searchSpotify(query: string): Promise<SpotifyTrack[]> {
  const saved = sessionStorage.getItem('spotify_token');
  if (!saved || !spotifyConnected()) throw new Error('Reconnect Spotify to search songs.');
  const token = JSON.parse(saved) as { value: string };
  const url = new URL('https://api.spotify.com/v1/search');
  url.search = new URLSearchParams({ q: query, type: 'track', limit: '10' }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.value}` } });
  if (!response.ok) throw new Error(response.status === 429 ? 'Spotify search is rate limited. Try again shortly.' : 'Spotify search failed. Reconnect and retry.');
  const data = await response.json() as { tracks?: { items?: { id: string; name: string; artists: { name: string }[] }[] } };
  return (data.tracks?.items ?? []).filter(track => /^[A-Za-z0-9]{22}$/.test(track.id)).map(track => ({ id: track.id, name: track.name, artist: track.artists.map(artist => artist.name).join(', '), url: `https://open.spotify.com/track/${track.id}` }));
}
