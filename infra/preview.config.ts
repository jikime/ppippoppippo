import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { decisionsPlugin } from '../server/decisions.ts';

// Preview the prepared static artifact without reading a real OpenAI API key.
export default defineConfig({
  root:fileURLToPath(new URL('..',import.meta.url)),
  build:{outDir:fileURLToPath(new URL('.build/site',import.meta.url))},
  plugins:[decisionsPlugin('')],
});
