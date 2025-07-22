import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import { v4 as uuidv4 } from "uuid";

export interface UsageLogEntry {
  timestamp: string;
  repository_name: string;
  github_url: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  session_id: string;
}

export class UsageLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = join(homedir(), ".homework-grader");
    this.logFile = join(this.logDir, "usage-log.json");
  }

  async logUsage(entry: Omit<UsageLogEntry, "timestamp" | "session_id">): Promise<void> {
    try {
      await this.ensureLogDirectoryExists();
      
      const logEntry: UsageLogEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
        session_id: uuidv4(),
      };

      const existingLogs = await this.readExistingLogs();
      existingLogs.push(logEntry);

      await fs.writeFile(this.logFile, JSON.stringify(existingLogs, null, 2), "utf8");
    } catch (error) {
      // Log to console but don't throw - usage logging should never break the app
      console.warn("Failed to log usage data:", error);
    }
  }

  async getUsageLogs(): Promise<UsageLogEntry[]> {
    try {
      return await this.readExistingLogs();
    } catch (error) {
      console.warn("Failed to read usage logs:", error);
      return [];
    }
  }

  async getUsageStats(): Promise<{
    totalSessions: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    providerBreakdown: Record<string, number>;
    dateRange: { earliest: string; latest: string } | null;
  }> {
    const logs = await this.getUsageLogs();
    
    if (logs.length === 0) {
      return {
        totalSessions: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        providerBreakdown: {},
        dateRange: null,
      };
    }

    const providerBreakdown: Record<string, number> = {};
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    logs.forEach(log => {
      totalTokens += log.totalTokens;
      totalInputTokens += log.inputTokens;
      totalOutputTokens += log.outputTokens;
      
      providerBreakdown[log.provider] = (providerBreakdown[log.provider] || 0) + log.totalTokens;
    });

    const sortedLogs = logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    
    return {
      totalSessions: logs.length,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      providerBreakdown,
      dateRange: {
        earliest: sortedLogs[0].timestamp,
        latest: sortedLogs[sortedLogs.length - 1].timestamp,
      },
    };
  }

  private async ensureLogDirectoryExists(): Promise<void> {
    try {
      await fs.access(this.logDir);
    } catch {
      await fs.mkdir(this.logDir, { recursive: true });
    }
  }

  private async readExistingLogs(): Promise<UsageLogEntry[]> {
    try {
      const data = await fs.readFile(this.logFile, "utf8");
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}

export const usageLogger = new UsageLogger();