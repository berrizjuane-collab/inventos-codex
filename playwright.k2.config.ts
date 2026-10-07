import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/k2',timeout:60000,expect:{timeout:10000},workers:1,
  use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:900},
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',
      args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']},trace:'retain-on-failure'},
  webServer:{command:'pnpm dev --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:true},
  reporter:[['list'],['json',{outputFile:'evidence/k2/browser-results.json'}]]
});
