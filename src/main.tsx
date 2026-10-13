import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { GuestProgressProvider } from './context/GuestProgressContext';
import { FormPreferencesProvider } from './context/FormPreferencesContext';
import { SocialProvider } from './context/SocialContext';
import './styles.css';
import './social.css';
import './theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find the #root element. Check index.html.');

createRoot(rootElement).render(
  <StrictMode>
    {/* BrowserRouter turns /admin, /login, etc. into proper React pages. */}
    <BrowserRouter>
      {/* AuthProvider exposes the Supabase session to every route below it. */}
      <AuthProvider>
        {/* Form rules are account-saved for users and in-memory for guests. */}
        <FormPreferencesProvider>
          {/* Guest progress lives only for this open browser session. */}
          <GuestProgressProvider>
            {/* Friend-request and unread-chat badges for the header. */}
            <SocialProvider>
              <App />
            </SocialProvider>
          </GuestProgressProvider>
        </FormPreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
