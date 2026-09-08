import { defineConfig } from 'vite';
export default defineConfig({
  base:'./',
  build:{target:'es2022',rolldownOptions:{output:{codeSplitting:{groups:[{name:'hilo3d',test:/node_modules\/hilo3d/}]}}}},
});
