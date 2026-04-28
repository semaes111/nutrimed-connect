import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/AuthContext'
import { bootCapacitor } from './lib/capacitorBoot'
import './index.css'

// Boot de plugins nativos (no-op en web, runs solo en Android/iOS Capacitor)
// No bloqueamos el render — corre en paralelo. Los plugins están disponibles
// inmediatamente al estar @capacitor/core inicializado por el WebView.
bootCapacitor()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
