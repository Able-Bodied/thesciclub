import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { takeHandoff } from '@/lib/home-screen-handoff';
import { stayCurrent } from '@/lib/stay-current';
import '@/index.css';

stayCurrent();

const root = document.getElementById('root');
if (!root) throw new Error('No #root element in index.html');
const mount = root;

function render() {
  createRoot(mount).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

// The iPhone Home Screen app's first open after being added from a signed-in
// Safari tab: signed in before the first screen (src/lib/home-screen-handoff.ts).
// Anywhere else takeHandoff answers at once; it is never waited on for long.
void Promise.race([
  takeHandoff().catch(() => 'refused'),
  new Promise((resolve) => {
    setTimeout(resolve, 8000);
  }),
]).then(render);
