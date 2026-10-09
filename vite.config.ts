import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { jevPlugin } from './server/jev.ts';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'TYPESAFE_');
  return {
  plugins: [react(),jevPlugin(process.env.TYPESAFE_API_KEY||process.env.TYPESAFE_AI_KEY||env.TYPESAFE_API_KEY||env.TYPESAFE_AI_KEY||'')],
  optimizeDeps: { exclude: ['recast-navigation', '@recast-navigation/core', '@recast-navigation/wasm'] },
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 1600 }
};});
