import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@/types', replacement: path.resolve(__dirname, 'types') },
      { find: '@/lib', replacement: path.resolve(__dirname, 'lib') },
      { find: '@/services', replacement: path.resolve(__dirname, 'services') },
      { find: '@/components', replacement: path.resolve(__dirname, 'src/components') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: 'types', replacement: path.resolve(__dirname, 'types') },
      { find: 'services', replacement: path.resolve(__dirname, 'services') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './test/setup.ts',
  },
});
