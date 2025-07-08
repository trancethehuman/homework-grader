import React, { useState, useEffect } from 'react';
import { Text, Box, useInput, useApp } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import open from 'open';
import { TokenStorage } from './lib/token-storage.js';

export interface CSVColumn {
  name: string;
  index: number;
  sampleValues: string[];
}

export interface CSVAnalysis {
  filePath: string;
  columns: CSVColumn[];
  totalRows: number;
  suggestedGitHubColumn?: CSVColumn;
}

interface InteractiveCSVProps {
  onComplete: (filePath: string, columnName: string, urls: string[], githubToken?: string) => void;
  onError: (error: string) => void;
}

type Step = 'github-token' | 'input' | 'analyzing' | 'select' | 'loading' | 'complete';

export const InteractiveCSV: React.FC<InteractiveCSVProps> = ({ onComplete, onError }) => {
  const [step, setStep] = useState<Step>('github-token');
  const [csvPath, setCsvPath] = useState('');
  const [input, setInput] = useState('');
  const [githubToken, setGithubToken] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<CSVAnalysis | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [tokenStorage] = useState(new TokenStorage());
  const { exit } = useApp();

  // Initialize token from storage or environment
  useEffect(() => {
    const savedToken = tokenStorage.getToken();
    const envToken = process.env.GITHUB_TOKEN;
    setGithubToken(savedToken || envToken);
  }, [tokenStorage]);

  const validateAndAnalyzeCSV = async (filePath: string): Promise<CSVAnalysis> => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (path.extname(filePath).toLowerCase() !== '.csv') {
      throw new Error(`Invalid file type. Expected .csv file, got: ${path.extname(filePath)}`);
    }

    const columns: CSVColumn[] = [];
    const sampleData: Record<string, string[]> = {};
    let totalRows = 0;
    let headerProcessed = false;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: Record<string, string>) => {
          if (!headerProcessed) {
            Object.keys(row).forEach((columnName, index) => {
              columns.push({
                name: columnName,
                index,
                sampleValues: []
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
        .on('end', () => {
          columns.forEach(column => {
            column.sampleValues = sampleData[column.name] || [];
          });

          const suggestedGitHubColumn = columns.find(column => {
            const nameContainsGitHub = column.name.toLowerCase().includes('github');
            const hasGitHubUrls = column.sampleValues.some(value => 
              value.toLowerCase().includes('github.com')
            );
            return nameContainsGitHub || hasGitHubUrls;
          });

          resolve({
            filePath,
            columns,
            totalRows,
            suggestedGitHubColumn
          });
        })
        .on('error', (error: any) => {
          reject(new Error(`Error reading CSV file: ${error.message}`));
        });
    });
  };

  const loadGitHubUrlsFromColumn = async (filePath: string, columnName: string): Promise<string[]> => {
    const urls: string[] = [];
    const urlSet = new Set<string>();

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: Record<string, string>) => {
          const value = row[columnName];
          if (value && isValidGitHubURL(value)) {
            const normalizedUrl = value.trim().toLowerCase();
            if (!urlSet.has(normalizedUrl)) {
              urlSet.add(normalizedUrl);
              urls.push(value.trim());
            }
          }
        })
        .on('end', () => {
          resolve(urls);
        })
        .on('error', (error: any) => {
          reject(new Error(`Error reading CSV file: ${error.message}`));
        });
    });
  };

  const isValidGitHubURL = (url: string): boolean => {
    if (!url || typeof url !== 'string') {
      return false;
    }

    const trimmedUrl = url.trim();
    return (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) && 
           trimmedUrl.includes('github.com');
  };

  useInput(async (inputChar, key) => {
    if (step === 'github-token') {
      if (key.return) {
        const newToken = input.trim() || githubToken;
        if (newToken && newToken !== githubToken) {
          try {
            tokenStorage.saveToken(newToken);
            console.log('✓ Token saved securely to:', tokenStorage.getConfigDir());
          } catch (err) {
            console.error('Error saving token:', err);
          }
        }
        setGithubToken(newToken);
        setInput('');
        setStep('input');
      } else if (key.backspace) {
        setInput(prev => prev.slice(0, -1));
      } else if (inputChar === 'o' && !input) {
        // Open browser to GitHub token page
        open('https://github.com/settings/tokens/new?description=homework-grader&scopes=repo');
        setInput('');
      } else if (inputChar === 'c' && !input) {
        // Clear stored token
        tokenStorage.clearToken();
        setGithubToken(undefined);
        setInput('');
      } else if (inputChar && !key.ctrl && !key.meta && !key.escape) {
        setInput(prev => prev + inputChar);
      }
    } else if (step === 'input') {
      if (key.return) {
        if (input.trim()) {
          setCsvPath(input.trim());
          setStep('analyzing');
          try {
            const analysisResult = await validateAndAnalyzeCSV(input.trim());
            setAnalysis(analysisResult);
            setSelectedColumn(analysisResult.suggestedGitHubColumn ? 
              analysisResult.columns.findIndex(c => c.name === analysisResult.suggestedGitHubColumn!.name) : 0);
            setStep('select');
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            onError(err instanceof Error ? err.message : String(err));
            exit();
          }
        }
      } else if (key.backspace) {
        setInput(prev => prev.slice(0, -1));
      } else if (inputChar && !key.ctrl && !key.meta && !key.escape) {
        setInput(prev => prev + inputChar);
      }
    } else if (step === 'select' && analysis) {
      if (key.upArrow) {
        setSelectedColumn(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedColumn(prev => Math.min(analysis.columns.length - 1, prev + 1));
      } else if (key.return) {
        setStep('loading');
        try {
          const urls = await loadGitHubUrlsFromColumn(csvPath, analysis.columns[selectedColumn].name);
          onComplete(csvPath, analysis.columns[selectedColumn].name, urls, githubToken);
          setStep('complete');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          onError(err instanceof Error ? err.message : String(err));
          exit();
        }
      }
    }

    if (key.ctrl && inputChar === 'c') {
      exit();
    }
  });

  if (step === 'github-token') {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>GitHub Authentication Setup</Text>
        <Text></Text>
        <Text>To avoid rate limiting (60 requests/hour), please enter your GitHub Personal Access Token:</Text>
        <Text dimColor>• Press 'o' to open GitHub token generation page in browser</Text>
        <Text dimColor>• Generate a token with 'repo' scope</Text>
        <Text dimColor>• Press 'c' to clear stored token</Text>
        <Text dimColor>• Or press Enter to continue without authentication</Text>
        <Text></Text>
        <Text>Current token: {githubToken ? `${githubToken.substring(0, 8)}... (saved)` : 'None'}</Text>
        <Text dimColor>Stored in: {tokenStorage.getConfigDir()}</Text>
        <Text></Text>
        <Text>Enter GitHub token (or press Enter to skip):</Text>
        <Box>
          <Text color="green">{'> '}</Text>
          <Text>{input.replace(/./g, '*')}</Text>
          <Text color="gray">█</Text>
        </Box>
        <Text dimColor>Press 'o' to open GitHub, 'c' to clear token, Enter to continue, Ctrl+C to exit</Text>
      </Box>
    );
  }

  if (step === 'input') {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>CSV GitHub URL Extractor</Text>
        <Text>Authentication: {githubToken ? '✓ Token configured' : '⚠ No token (60 requests/hour limit)'}</Text>
        <Text></Text>
        <Text>Enter the path to your CSV file:</Text>
        <Box>
          <Text color="green">{'> '}</Text>
          <Text>{input}</Text>
          <Text color="gray">█</Text>
        </Box>
        <Text dimColor>Press Enter to continue, Ctrl+C to exit</Text>
      </Box>
    );
  }

  if (step === 'analyzing') {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Analyzing CSV file...</Text>
        <Text>Reading: {csvPath}</Text>
      </Box>
    );
  }

  if (step === 'select' && analysis) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>CSV Analysis Complete</Text>
        <Text>File: {analysis.filePath}</Text>
        <Text>Total rows: {analysis.totalRows}</Text>
        <Text></Text>
        <Text color="green" bold>Select GitHub URL column:</Text>
        <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select</Text>
        <Text></Text>
        
        {analysis.columns.map((column, index) => {
          const isSelected = index === selectedColumn;
          const isSuggested = analysis.suggestedGitHubColumn?.name === column.name;
          
          return (
            <Box key={index} flexDirection="column">
              <Box>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {isSelected ? '→ ' : '  '}
                  {index + 1}. {column.name}
                  {isSuggested ? ' (suggested)' : ''}
                </Text>
              </Box>
              {column.sampleValues.length > 0 && (
                <Box marginLeft={4}>
                  <Text dimColor>Sample: {column.sampleValues.join(', ')}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  if (step === 'loading') {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Loading GitHub URLs...</Text>
        <Text>Processing column: {analysis?.columns[selectedColumn].name}</Text>
      </Box>
    );
  }

  if (step === 'complete') {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>✓ Complete!</Text>
        <Text>GitHub URLs loaded successfully</Text>
      </Box>
    );
  }

  return null;
};