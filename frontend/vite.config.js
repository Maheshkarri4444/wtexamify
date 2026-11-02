import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [react()],
  // Google sign-in redirects back to exactly this port, so never drift to another one.
  server: { port: 5173, strictPort: true },
});
