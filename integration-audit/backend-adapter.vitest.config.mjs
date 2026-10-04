import { fileURLToPath } from 'node:url';
import { defineConfig } from '../backend/node_modules/vitest/dist/config.js';

export default defineConfig({
  root: fileURLToPath(new URL('../backend/', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../backend/src/', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/unit/mongo-optimizer-adapter.test.ts'] },
});
