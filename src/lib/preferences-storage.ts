import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

interface Preferences {
  selectedProvider?: string;
  notionDatabaseId?: string;
  notionConfig?: {
    lastUsedDatabase?: string;
    preferredPropertyName?: string;
    lastUsedPropertyName?: string;
  };
  version: string;
}

export class PreferencesStorage {
  private configDir: string;
  private preferencesPath: string;

  constructor() {
    this.configDir = this.getConfigDir();
    this.preferencesPath = path.join(this.configDir, 'preferences.json');
  }

  private getConfigDir(): string {
    const homeDir = os.homedir();
    
    switch (process.platform) {
      case 'win32':
        return path.join(process.env.APPDATA || homeDir, 'homework-grader');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'homework-grader');
      default:
        return path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), 'homework-grader');
    }
  }

  async ensureConfigDir(): Promise<void> {
    try {
      await fs.access(this.configDir);
    } catch {
      await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  async savePreferences(preferences: Partial<Preferences>): Promise<void> {
    await this.ensureConfigDir();
    
    const existingPreferences = await this.loadPreferences();
    const updatedPreferences: Preferences = {
      ...existingPreferences,
      ...preferences,
      version: '1.0.0'
    };

    await fs.writeFile(
      this.preferencesPath,
      JSON.stringify(updatedPreferences, null, 2),
      'utf8'
    );
  }

  async loadPreferences(): Promise<Preferences> {
    try {
      const data = await fs.readFile(this.preferencesPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return {
        version: '1.0.0'
      };
    }
  }

  async clearPreferences(): Promise<void> {
    try {
      await fs.unlink(this.preferencesPath);
    } catch {
      // File doesn't exist, nothing to clear
    }
  }

  getConfigPath(): string {
    return this.preferencesPath;
  }
}