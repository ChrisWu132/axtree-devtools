import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global E2E teardown...');
  
  // Clean up any remaining processes
  console.log('✅ Global teardown completed');
}

export default globalTeardown;