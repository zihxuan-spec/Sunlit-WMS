import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 請把 wms-project 換成你的 GitHub Repository 名稱！
  base: '/Sunlit-WMS/' 
})