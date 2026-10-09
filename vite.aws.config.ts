import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},build:{outDir:'dist/aws-web',emptyOutDir:true},server:{port:5174,host:'127.0.0.1'}});
