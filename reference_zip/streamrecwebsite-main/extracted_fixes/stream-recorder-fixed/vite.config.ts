import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Fix: Removed the broken HMR ternary (`false : false`) and removed the
// unnecessary GEMINI_API_KEY exposure in the frontend bundle.
// HMR is simply disabled unconditionally to prevent EADDRINUSE crashes when
// running inside the custom Express/Vite middleware setup.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // HMR is disabled because the Vite dev server runs in middlewareMode
    // inside Express, so the separate HMR WebSocket port causes conflicts.
    hmr: false,
  },
});
