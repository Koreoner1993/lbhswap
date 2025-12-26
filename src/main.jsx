import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TonConnectUIProvider } from '@tonconnect/ui-react'

import './index.css'
import App from './App.jsx'

// IMPORTANT for GitHub Pages:
// manifestUrl must be absolute, publicly reachable, and CORS-friendly.
const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
)
