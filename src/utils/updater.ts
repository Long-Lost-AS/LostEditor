import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask } from '@tauri-apps/plugin-dialog';

export async function checkForUpdates(showNoUpdateDialog = true): Promise<void> {
  try {
    const update = await check();

    if (update?.available) {
      const yes = await ask(
        `Update available: ${update.version}\n\nCurrent version: ${update.currentVersion}\n\nWould you like to download and install it now?`,
        {
          title: 'Update Available',
          kind: 'info',
        }
      );

      if (yes) {
        console.log('Downloading update...');

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log(`Started downloading ${event.data.contentLength} bytes`);
              break;
            case 'Progress':
              console.log(`Downloaded ${event.data.chunkLength} bytes`);
              break;
            case 'Finished':
              console.log('Download finished');
              break;
          }
        });

        console.log('Update installed, relaunching...');
        await relaunch();
      }
    } else if (showNoUpdateDialog) {
      await ask('You are already on the latest version.', {
        title: 'No Updates Available',
        kind: 'info',
      });
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
    await ask(`Failed to check for updates: ${error}`, {
      title: 'Update Check Failed',
      kind: 'error',
    });
  }
}
