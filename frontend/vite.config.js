import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' keeps the built files working from any folder (and later inside an Android wrapper).
export default defineConfig({
  base: './',
  plugins: [react()],
})
