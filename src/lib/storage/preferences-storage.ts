import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ProfileType } from './profile-storage.js';

interface Preferences {
  activeProfile?: ProfileType;
  selectedProvider?: string;
  notionDatabaseId?: string;
  notionConfig?: {
    lastUsedDatabase?: string;
    preferredPropertyName?: string;
    lastUsedPropertyName?: string;
  };
  githubConfig?: {
    maxDepth?: number;
  };
  gradingConfig?: {
    chunkingPreference?: 'allow' | 'skip';
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
        return path.join(process.env.APPDATA || homeDir, 'cli-agents-fleet');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'cli-agents-fleet');
      default:
        return path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), 'cli-agents-fleet');
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

  async saveGitHubConfig(config: { maxDepth?: number }): Promise<void> {
    const preferences = await this.loadPreferences();
    preferences.githubConfig = { ...preferences.githubConfig, ...config };
    await this.savePreferences(preferences);
  }

  getConfigPath(): string {
    return this.preferencesPath;
  }
}