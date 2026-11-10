import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { finishSpotifyConnection, nativeSpotifyRedirect } from './spotify';
import './style.css';
import './athletic.css';
async function start() {
  const completeSpotify = async (url?: string) => {
    try { await finishSpotifyConnection(url); }
    catch (error) { try { sessionStorage.setItem('spotify_error', error instanceof Error ? error.message : 'Spotify connection failed.'); } catch { /* browser storage is unavailable */ } }
  };
  if (Capacitor.isNativePlatform()) {
    const launch = await NativeApp.getLaunchUrl();
    if (launch?.url?.startsWith(nativeSpotifyRedirect)) await completeSpotify(launch.url);
    await NativeApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(nativeSpotifyRedirect)) return;
      void completeSpotify(url).then(() => Browser.close().catch(() => {})).finally(() => location.reload());
    });
  } else await completeSpotify();
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
}
void start();
