/**
 * Simple debug logging utility that respects environment variable
 */
export class DebugLogger {
  private static isDebugEnabled = process.env.DEBUG_NOTION === 'true' || process.env.DEBUG === 'true';

  static debug(message: string, ...args: any[]): void {
    if (this.isDebugEnabled) {
      console.log(message, ...args);
    }
  }

  static debugAuth(message: string, ...args: any[]): void {
    if (this.isDebugEnabled) {
      console.log(`[AUTH] ${message}`, ...args);
    }
  }

  static debugQuery(message: string, ...args: any[]): void {
    if (this.isDebugEnabled) {
      console.log(`[QUERY] ${message}`, ...args);
    }
  }

  static debugDataSource(message: string, ...args: any[]): void {
    if (this.isDebugEnabled) {
      console.log(`[DATA_SOURCE] ${message}`, ...args);
    }
  }

  static isEnabled(): boolean {
    return this.isDebugEnabled;
  }
}