import React from "react";
import { Text, Box } from "ink";
import { MenuSelector, MenuOption, MenuCategory } from "./ui/MenuSelector.js";

export type GradingMode = "local" | "batch" | "collaborator" | "bulk-research";

interface GradingModeSelectorProps {
  onSelect: (mode: GradingMode) => void;
}

const categories: MenuCategory[] = [
  { id: "analyze", name: "ANALYZE & GRADE", icon: "📊" },
  { id: "repo-mgmt", name: "REPOSITORY MANAGEMENT", icon: "👥" },
  { id: "research", name: "RESEARCH", icon: "🔬" },
];

const options: MenuOption<GradingMode>[] = [
  {
    id: "local",
    category: "analyze",
    name: "Analyze local repository",
    description: "Run AI analysis on a repository on your machine",
  },
  {
    id: "batch",
    category: "analyze",
    name: "Batch analyze repositories",
    description: "Analyze multiple GitHub repos from Notion, CSV, or manual input",
  },
  {
    id: "collaborator",
    category: "repo-mgmt",
    name: "Bulk add collaborators",
    description: "Add multiple users as collaborators to a repository",
  },
  {
    id: "bulk-research",
    category: "research",
    name: "Bulk research",
    description: "Spin up agents per row to research and enrich your data",
    comingSoon: true,
  },
];

const AppHeader: React.FC = () => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="cyan" bold>
      ╔═══════════════════════════════════════════════════════╗
    </Text>
    <Text color="cyan" bold>
      ║  CLI Agents Fleet                                     ║
    </Text>
    <Text color="cyan">
      ║  Run AI agents at scale across your data              ║
    </Text>
    <Text color="cyan" bold>
      ╚═══════════════════════════════════════════════════════╝
    </Text>
    <Text></Text>
    <Text dimColor>
      Data sources: Notion • CSV • Manual input
    </Text>
    <Text></Text>
  </Box>
);

export const GradingModeSelector: React.FC<GradingModeSelectorProps> = ({
  onSelect,
}) => {
  return (
    <MenuSelector
      title=""
      options={options}
      onSelect={onSelect}
      categories={categories}
      customHeader={<AppHeader />}
    />
  );
};
