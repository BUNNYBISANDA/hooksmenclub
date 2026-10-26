import { defineConfig,devices } from '@playwright/test';

export default defineConfig({
  testDir:'tests/browser',fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:5178',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
  webServer:{command:'npm run dev -- --port 5178 --strictPort',url:'http://127.0.0.1:5178',reuseExistingServer:false,
    env:{VITE_API_MODE:'fixtures',VITE_SUPABASE_URL:'',VITE_SUPABASE_ANON_KEY:'',VITE_TURNSTILE_SITE_KEY:''}},
});
