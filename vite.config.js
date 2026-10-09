import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function apiDevServerPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api')) {
          try {
            const { default: handler } = await import('./api/index.js');
            await handler(req, res);
          } catch (err) {
            console.error('API Dev Server Error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        } else {
          next();
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    apiDevServerPlugin(),
  ],
  server: {
    port: 3000,
  },
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },
})
