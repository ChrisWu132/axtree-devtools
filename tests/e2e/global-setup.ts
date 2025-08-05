import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global E2E setup...');
  
  // Ensure clean state before tests
  console.log('✅ Global setup completed');
}

export default globalSetup;