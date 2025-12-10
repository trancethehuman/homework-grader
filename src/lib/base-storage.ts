import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Abstract base class for secure storage of tokens and configuration.
 * Provides platform-appropriate config directory management and basic CRUD operations.
 *
 * @template T The type of data being stored
 */
export abstract class BaseSecureStorage<T> {
  protected readonly configDir: string;
  protected readonly filePath: string;

  constructor(fileName: string) {
    this.configDir = this.getPlatformConfigDir();
    this.filePath = join(this.configDir, fileName);
  }

  /**
   * Gets the platform-appropriate config directory for the application.
   */
  private getPlatformConfigDir(): string {
    const platform = process.platform;
    if (platform === 'win32') {
      return join(process.env.APPDATA || homedir(), 'cli-agents-fleet');
    } else if (platform === 'darwin') {
      return join(homedir(), 'Library', 'Application Support', 'cli-agents-fleet');
    } else {
      return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'cli-agents-fleet');
    }
  }

  /**
   * Ensures the config directory exists with appropriate permissions.
   */
  protected ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Serializes data for storage. Override for custom serialization.
   * Default implementation uses base64 encoding for strings, JSON for objects.
   */
  protected abstract serialize(data: T): string;

  /**
   * Deserializes stored data. Override for custom deserialization.
   */
  protected abstract deserialize(data: string): T;

  /**
   * Validates data before saving. Override to add validation logic.
   * Should throw an error if validation fails.
   */
  protected abstract validate(data: T): void;

  /**
   * Saves data securely to the storage file.
   */
  save(data: T): void {
    this.validate(data);
    this.ensureConfigDir();
    const serialized = this.serialize(data);
    writeFileSync(this.filePath, serialized, { mode: 0o600 });
  }

  /**
   * Loads data from the storage file.
   * @returns The stored data, or null if not found or invalid
   */
  load(): T | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    try {
      const data = readFileSync(this.filePath, 'utf8');
      if (!data || data.trim().length === 0) {
        return null;
      }
      return this.deserialize(data.trim());
    } catch (error) {
      console.error(`Error reading from ${this.filePath}:`, error);
      return null;
    }
  }

  /**
   * Clears the stored data by removing the file.
   */
  clear(): void {
    if (existsSync(this.filePath)) {
      try {
        unlinkSync(this.filePath);
      } catch (error) {
        // Fallback: overwrite with empty content
        try {
          writeFileSync(this.filePath, '', { mode: 0o600 });
        } catch {
          console.error(`Failed to clear ${this.filePath}:`, error);
        }
      }
    }
  }

  /**
   * Checks if valid data is stored.
   */
  exists(): boolean {
    return existsSync(this.filePath) && this.load() !== null;
  }

  /**
   * Gets the config directory path (for debugging/display purposes).
   */
  getConfigDir(): string {
    return this.configDir;
  }
}

/**
 * Simple string storage with base64 obfuscation.
 * Use this for tokens and API keys.
 */
export abstract class BaseStringStorage extends BaseSecureStorage<string> {
  protected serialize(data: string): string {
    return Buffer.from(data.trim()).toString('base64');
  }

  protected deserialize(data: string): string {
    return Buffer.from(data, 'base64').toString('utf8');
  }

  protected validate(data: string): void {
    if (!data || data.trim() === '') {
      throw new Error('Value cannot be empty');
    }
  }
}

/**
 * JSON object storage with file permissions.
 * Use this for complex configuration objects.
 */
export abstract class BaseJsonStorage<T extends object> extends BaseSecureStorage<T> {
  protected serialize(data: T): string {
    return JSON.stringify(data, null, 2);
  }

  protected deserialize(data: string): T {
    return JSON.parse(data);
  }
}
