import * as fs from "fs";
import * as path from "path";
import csv from "csv-parser";
import { GitHubUrlParser } from "./github-url-parser.js";

/**
 * Represents a column in a CSV file.
 */
export interface CSVColumn {
  name: string;
  index: number;
  sampleValues: string[];
}

/**
 * Result of analyzing a CSV file.
 */
export interface CSVAnalysis {
  filePath: string;
  columns: CSVColumn[];
  totalRows: number;
  suggestedGitHubColumn?: CSVColumn;
}

/**
 * Validates and analyzes a CSV file, extracting column information
 * and suggesting which column might contain GitHub URLs.
 * @param filePath Path to the CSV file
 * @returns Analysis result with columns and suggested GitHub column
 */
export async function validateAndAnalyzeCSV(filePath: string): Promise<CSVAnalysis> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (path.extname(filePath).toLowerCase() !== ".csv") {
    throw new Error(
      `Invalid file type. Expected .csv file, got: ${path.extname(filePath)}`
    );
  }

  const columns: CSVColumn[] = [];
  const sampleData: Record<string, string[]> = {};
  let totalRows = 0;
  let headerProcessed = false;

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row: Record<string, string>) => {
        if (!headerProcessed) {
          Object.keys(row).forEach((columnName, index) => {
            columns.push({
              name: columnName,
              index,
              sampleValues: [],
            });
            sampleData[columnName] = [];
          });
          headerProcessed = true;
        }

        Object.entries(row).forEach(([columnName, value]) => {
          if (sampleData[columnName].length < 3 && value && value.trim()) {
            sampleData[columnName].push(value.trim());
          }
        });

        totalRows++;
      })
      .on("end", () => {
        columns.forEach((column) => {
          column.sampleValues = sampleData[column.name] || [];
        });

        const suggestedGitHubColumn = columns.find((column) => {
          const nameContainsGitHub = column.name.toLowerCase().includes("github");
          const hasGitHubUrls = column.sampleValues.some((value) =>
            value.toLowerCase().includes("github.com")
          );
          return nameContainsGitHub || hasGitHubUrls;
        });

        resolve({
          filePath,
          columns,
          totalRows,
          suggestedGitHubColumn,
        });
      })
      .on("error", (error: Error) => {
        reject(new Error(`Error reading CSV file: ${error.message}`));
      });
  });
}

/**
 * Loads GitHub URLs from a specific column in a CSV file.
 * URLs are validated and deduplicated.
 * @param filePath Path to the CSV file
 * @param columnName Name of the column containing GitHub URLs
 * @returns Array of valid, unique GitHub URLs
 */
export async function loadGitHubUrlsFromColumn(
  filePath: string,
  columnName: string
): Promise<string[]> {
  const urls: string[] = [];
  const urlSet = new Set<string>();

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row: Record<string, string>) => {
        const value = row[columnName];
        if (value && GitHubUrlParser.isValidGitHubUrl(value)) {
          const normalizedUrl = value.trim().toLowerCase();
          if (!urlSet.has(normalizedUrl)) {
            urlSet.add(normalizedUrl);
            urls.push(value.trim());
          }
        }
      })
      .on("end", () => {
        resolve(urls);
      })
      .on("error", (error: Error) => {
        reject(new Error(`Error reading CSV file: ${error.message}`));
      });
  });
}
