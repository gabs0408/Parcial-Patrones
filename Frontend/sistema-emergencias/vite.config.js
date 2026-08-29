import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'os';
import path from 'path';

// Configura la caché de Vite en una carpeta fuera de OneDrive (AppData/Temp)
export default defineConfig({
  plugins: [react()],
  cacheDir: path.join(os.tmpdir(), 'vite-cache-sistema-emergencias'),
});