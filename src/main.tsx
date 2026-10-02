import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { StaffSessionProvider } from './context/StaffSession';
import { PulseSessionProvider } from './context/PulseSession';
import { AppSettingsProvider } from './context/AppSettings';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppSettingsProvider>
        <PulseSessionProvider>
          <StaffSessionProvider>
            <App />
          </StaffSessionProvider>
        </PulseSessionProvider>
      </AppSettingsProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
