import React, { useMemo, useState } from "react";
import { Text, Box, useInput } from "ink";
import { MenuSelector, MenuOption, MenuCategory } from "./ui/MenuSelector.js";
import { ProfileType, PROFILE_MENU_ITEMS } from "../lib/profile-storage.js";

export type GradingMode = "local" | "batch" | "collaborator" | "bulk-research";

interface GradingModeSelectorProps {
  onSelect: (mode: GradingMode) => void;
  activeProfile?: ProfileType;
  onSwitchProfile?: () => void;
}

const categories: MenuCategory[] = [
  { id: "analyze", name: "ANALYZE CODE", icon: "" },
  { id: "repo-mgmt", name: "GITHUB MANAGEMENT", icon: "👥" },
  { id: "research", name: "RESEARCH", icon: "🔬" },
];

const allOptions: MenuOption<GradingMode>[] = [
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
    <Text dimColor>Data sources: Notion • CSV • Manual input</Text>
    <Text></Text>
  </Box>
);

interface ProfileFooterProps {
  isFocused: boolean;
}

const ProfileFooter: React.FC<ProfileFooterProps> = ({ isFocused }) => {
  return (
    <Box>
      <Text color={isFocused ? "blue" : "gray"} bold={isFocused}>
        {isFocused ? "→ " : "  "}
      </Text>
      <Text color={isFocused ? "blue" : "gray"} bold={isFocused}>
        Switch profile
      </Text>
    </Box>
  );
};

export const GradingModeSelector: React.FC<GradingModeSelectorProps> = ({
  onSelect,
  activeProfile,
  onSwitchProfile,
}) => {
  const [isFooterFocused, setIsFooterFocused] = useState(false);

  const options = useMemo(() => {
    if (!activeProfile) return allOptions;
    const allowedModes = PROFILE_MENU_ITEMS[activeProfile];
    return allOptions.filter(opt => allowedModes.includes(opt.id));
  }, [activeProfile]);

  const filteredCategories = useMemo(() => {
    const usedCategories = new Set(options.map(opt => opt.category));
    return categories.filter(cat => usedCategories.has(cat.id));
  }, [options]);

  useInput((_input, key) => {
    if (isFooterFocused) {
      if (key.upArrow) {
        setIsFooterFocused(false);
      } else if (key.return && onSwitchProfile) {
        onSwitchProfile();
      }
    }
  });

  const handleSelect = (mode: GradingMode) => {
    if (!isFooterFocused) {
      onSelect(mode);
    }
  };

  const handleNavigateEnd = () => {
    if (activeProfile && onSwitchProfile) {
      setIsFooterFocused(true);
    }
  };

  return (
    <MenuSelector
      title=""
      options={options}
      onSelect={handleSelect}
      categories={filteredCategories}
      customHeader={<AppHeader />}
      footer={activeProfile && onSwitchProfile ? <ProfileFooter isFocused={isFooterFocused} /> : undefined}
      onNavigateEnd={handleNavigateEnd}
      disableHighlight={isFooterFocused}
    />
  );
};
