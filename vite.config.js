import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Port dédié, distinct de maket-client (5173) et maket-admin (5180) — évite le
  // conflit de port qui faisait basculer un des projets sur un autre port au hasard.
  server: { port: 5182, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Sépare les grosses dépendances stables dans leurs propres chunks (même
        // pattern que maket-client) : sans ça, firebase/framer-motion étaient
        // rebundlés dans le chunk principal, gonflé à ~1 Mo et re-téléchargé en
        // entier à chaque déploiement au lieu d'être mis en cache indépendamment.
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'vendor-firebase';
          if (id.includes('node_modules/framer-motion')) return 'vendor-motion';
        },
      },
    },
  },
})
