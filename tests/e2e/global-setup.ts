import { execSync } from 'node:child_process';

// Build the E2E variant (adds host permissions so tests can inject without a user gesture).
export default function globalSetup() {
  execSync('npx wxt build', { stdio: 'inherit', env: { ...process.env, CHAT2KNOW_E2E: '1' } });
}
