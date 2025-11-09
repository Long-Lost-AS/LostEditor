import { check } from '@tauri-apps/plugin-updater';

/**
 * Test function to check if the updater is properly configured
 * This will attempt to check for updates but won't find any unless you have a release
 */
export async function testUpdaterConfiguration(): Promise<void> {
  console.log('Testing updater configuration...');

  try {
    console.log('Attempting to check for updates...');
    const update = await check();

    if (update) {
      console.log('✅ Updater check successful!');

      if (update.available) {
        console.log('🎉 Update available:', {
          version: update.version,
          currentVersion: update.currentVersion,
          date: update.date,
          body: update.body
        });
      } else {
        console.log('✅ No update available (already on latest version)');
      }
    } else {
      console.log('✅ Updater configured correctly, no update info available yet');
      console.log('ℹ️  This is expected if you haven\'t published a release yet');
    }
  } catch (error) {
    console.error('❌ Updater test failed:', error);
    console.log('\nPossible issues:');
    console.log('1. No releases published yet (this is OK for testing)');
    console.log('2. GitHub endpoint not accessible');
    console.log('3. Updater permissions not configured');
  }
}
