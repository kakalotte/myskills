import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { App } from './App';
import { ThemedApp } from './theme/ThemedApp';
import './styles/theme.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('找不到应用根节点 #root');
}

createRoot(container).render(
  <StrictMode>
    <ThemedApp>
      <App />
    </ThemedApp>
  </StrictMode>,
);
