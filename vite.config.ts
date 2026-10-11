import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import devServer from '@hono/vite-dev-server';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  // expose .env to the Hono app during local dev (Vercel injects these in production)
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v;

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Runs the same Hono app that Vercel deploys, on the same port as Vite.
      devServer({ entry: 'api/_lib/app.ts', exclude: [/^(?!\/api\/).*/] }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
    worker: { format: 'es' },
    // Pre-bundle heavy deps up front so the dev server never reloads mid-session.
    optimizeDeps: {
      include: ['pdfjs-dist', 'pdfjs-dist/build/pdf.worker.min.mjs', 'mammoth/mammoth.browser.js', 'comlink', 'three', '@react-three/fiber', 'canvas-confetti', 'vaul', 'cmdk', 'radix-ui'],
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('three') || id.includes('@react-three')) return 'three';
            if (id.includes('radix-ui') || id.includes('@radix-ui') || id.includes('cmdk') || id.includes('vaul')) return 'ui-kit';
            if (id.includes('motion')) return 'motion';
          },
        },
      },
    },
  };
});
