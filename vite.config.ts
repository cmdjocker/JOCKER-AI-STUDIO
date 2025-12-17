
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Fix: Define __dirname for ESM environment as it's not a global variable in Vite/ESM
const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [
      react(),
      {
        name: 'copy-redirects',
        closeBundle() {
          // Manually copy _redirects to dist if it exists in root
          // Fix: Use the defined __dirname constant
          const src = resolve(__dirname, '_redirects');
          const dest = resolve(__dirname, 'dist/_redirects');
          
          // Fix: Use imported 'fs' module instead of 'require', which is not available in ESM
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
          }
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});
