/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the static build works on GitHub Pages / Netlify subpaths.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
