import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import 'leaflet/dist/leaflet.css'

// Enregistrement immédiat (avant même la connexion) — pushNotificationsService
// enregistre aussi ce même service worker après connexion pour obtenir un token
// FCM, mais Chrome exige qu'un service worker avec un handler fetch soit déjà
// présent pour proposer l'installation PWA (icône "Ajouter à l'écran d'accueil"),
// ce qui n'était pas le cas tant que l'enregistrement attendait la connexion.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
