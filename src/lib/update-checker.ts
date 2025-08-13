import updateNotifier from 'update-notifier';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Update checker utility for homework-grader CLI
 * Shows friendly notifications when new versions are available
 */
export class UpdateChecker {
  private notifier: any;
  private packageInfo: any;

  constructor() {
    try {
      // Get the package.json path relative to this file
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const packagePath = join(currentDir, '..', '..', 'package.json');
      
      // Read package.json to get current version info
      this.packageInfo = JSON.parse(readFileSync(packagePath, 'utf8'));
      
      // Initialize update notifier with respectful settings
      this.notifier = updateNotifier({
        pkg: this.packageInfo,
        updateCheckInterval: 1000 * 60 * 60 * 24, // Check once per day
        shouldNotifyInNpmScript: false, // Don't show when running via npm scripts
      });
    } catch (error) {
      // Fail silently - update checking is not critical functionality
      console.debug('Update checker initialization failed:', error);
      this.notifier = null;
    }
  }

  /**
   * Check for updates and show notification if available
   * Called at CLI startup
   */
  checkForUpdates(): void {
    if (!this.notifier) {
      return;
    }

    try {
      // Check for updates (uses cached results if recent check exists)
      if (this.notifier.update) {
        this.showUpdateNotification();
      }
    } catch (error) {
      // Fail silently - don't break the CLI if update check fails
      console.debug('Update check failed:', error);
    }
  }

  /**
   * Show friendly update notification at the end of CLI execution
   */
  showUpdateNotificationAtExit(): void {
    if (!this.notifier?.update) {
      return;
    }

    try {
      console.log(''); // Empty line for spacing
      console.log('📦 Update available!');
      console.log(`   Current: ${this.notifier.update.current}`);
      console.log(`   Latest:  ${this.notifier.update.latest}`);
      console.log('');
      console.log('   Run the following to update:');
      console.log('   npm install -g homework-grader@latest');
      console.log('');
      
      // Optional: Show link to release notes
      if (this.packageInfo.repository?.url) {
        const repoUrl = this.packageInfo.repository.url
          .replace('git+', '')
          .replace('.git', '');
        console.log(`   Release notes: ${repoUrl}/releases`);
        console.log('');
      }
    } catch (error) {
      console.debug('Failed to show update notification:', error);
    }
  }

  /**
   * Show update notification immediately (for startup check)
   */
  private showUpdateNotification(): void {
    // For startup, we'll just set a flag and show at exit
    // This avoids interrupting the user's workflow
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    return this.packageInfo?.version || 'unknown';
  }

  /**
   * Get available update info
   */
  getUpdateInfo(): { current: string; latest: string } | null {
    if (!this.notifier?.update) {
      return null;
    }

    return {
      current: this.notifier.update.current,
      latest: this.notifier.update.latest,
    };
  }

  /**
   * Force check for updates (bypass cache)
   */
  async forceCheckForUpdates(): Promise<boolean> {
    if (!this.notifier) {
      return false;
    }

    try {
      // Force a fresh check by creating new notifier instance
      const freshNotifier = updateNotifier({
        pkg: this.packageInfo,
        updateCheckInterval: 0, // Force immediate check
      });

      return !!freshNotifier.update;
    } catch (error) {
      console.debug('Force update check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const updateChecker = new UpdateChecker();