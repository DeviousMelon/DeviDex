import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite handles the development server and production build.
// The React plugin lets Vite understand JSX/TSX files and enables Fast Refresh.
export default defineConfig({
  plugins: [react()],
});
