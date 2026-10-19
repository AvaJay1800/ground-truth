import { render } from 'preact';
import './index.css';
import { App } from './app';

render(<App />, document.getElementById('app')!);

// Installable: register the service worker in production only, relative to the base path.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}
