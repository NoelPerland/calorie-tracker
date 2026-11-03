import React from 'react';
import { createRoot } from 'react-dom/client';
import { finishSpotifyConnection } from './spotify';
import './style.css';
async function start() {
  try { await finishSpotifyConnection(); }
  catch (error) { try { sessionStorage.setItem('spotify_error', error instanceof Error ? error.message : 'Spotify connection failed.'); } catch { /* browser storage is unavailable */ } }
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
}
void start();
