import {defineConfig,devices} from '@playwright/test';

// Uses the already installed Google Chrome. Never downloads a browser.
export default defineConfig({
  testDir:'./tests/e2e',
  fullyParallel:false,
  workers:1,
  retries:0,
  timeout:45_000,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:process.env.E2E_BASE_URL||'http://localhost:3000',channel:'chrome',trace:'retain-on-failure',screenshot:'only-on-failure',actionTimeout:10_000},
  projects:[
    {name:'desktop-light',use:{viewport:{width:1440,height:1000},colorScheme:'light'}},
    {name:'desktop-dark',use:{viewport:{width:1440,height:1000},colorScheme:'dark'}},
    {name:'iphone-light',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',channel:'chrome',colorScheme:'light'}},
    {name:'iphone-dark',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',channel:'chrome',colorScheme:'dark'}},
    {name:'android-light',use:{...devices['Pixel 7'],channel:'chrome',colorScheme:'light'}},
    {name:'android-dark',use:{...devices['Pixel 7'],channel:'chrome',colorScheme:'dark'}},
  ],
});
