import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthGate } from './auth/AuthGate'
import { watchTheme } from './state/themeStore'
import './index.css'

// Follows the host's data-theme attribute and the OS preference until the user
// picks a theme explicitly in the top bar.
watchTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{(user, signOut) => <App user={user} onSignOut={signOut} />}</AuthGate>
  </StrictMode>,
)
