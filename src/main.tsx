import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find the #root element. Check index.html.');

createRoot(rootElement).render(
  <StrictMode>
    {/* BrowserRouter turns /admin, /login, etc. into proper React pages. */}
    <BrowserRouter>
      {/* AuthProvider exposes the Supabase session to every route below it. */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
