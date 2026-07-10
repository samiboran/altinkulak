import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// DOKUNULMAZ: base GitHub Pages alt yolu icindir, silme.
export default defineConfig({
  plugins: [react()],
  base: '/altinkulak/',
  server: { port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
})
