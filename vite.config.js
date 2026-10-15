import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const edition = process.env.EDITION === 'standard' ? 'standard' : 'cutting';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __EDITION__: JSON.stringify(edition),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
  },
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },
})
