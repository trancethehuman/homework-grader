import type { GradingMode } from "../../components/grading-mode-selector.js";

export type ProfileType = "code-analysis" | "research";

export interface Profile {
  id: ProfileType;
  name: string;
  icon: string;
  description: string;
  features: string[];
}

export const PROFILES: Profile[] = [
  {
    id: "code-analysis",
    name: "Code Analysis",
    icon: "💻",
    description: "Analyze and grade coding projects for hackathons, homeworks, bootcamps",
    features: ["Analyze local repos", "Batch analyze", "GitHub collaborators"],
  },
  {
    id: "research",
    name: "Research",
    icon: "🔬",
    description: "Run bulk AI research tasks across your data sources",
    features: ["Bulk research agents (coming soon)"],
  },
];

export const PROFILE_MENU_ITEMS: Record<ProfileType, GradingMode[]> = {
  "code-analysis": ["local", "batch", "collaborator"],
  "research": ["bulk-research"],
};

export function getProfileById(id: ProfileType): Profile | undefined {
  return PROFILES.find(p => p.id === id);
}
