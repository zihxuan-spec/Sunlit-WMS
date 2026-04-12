import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 把原本的 base: '/wms-project/' 整行刪掉！
})
