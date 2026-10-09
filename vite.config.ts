import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { decisionsPlugin } from './server/decisions.ts';
import { devicePlugin } from './server/device.ts';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'OPENAI_');
  return {
  plugins: [react(),decisionsPlugin(process.env.OPENAI_API_KEY||env.OPENAI_API_KEY||''),devicePlugin()],
  optimizeDeps: { exclude: ['recast-navigation', '@recast-navigation/core', '@recast-navigation/wasm'] },
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 1600 }
};});
