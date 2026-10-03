import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Auth from './Auth';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('A página não contém o elemento #root.');

createRoot(root).render(
  <React.StrictMode>
    {root.dataset.login === 'true'
      ? <Auth />
      : <App admin={root.dataset.admin === 'true'} home={root.dataset.home === 'true'} />}
  </React.StrictMode>,
);
