import React from "react";
import { Text, Box } from "ink";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";
import { PROFILES, ProfileType, Profile } from "../lib/profile-storage.js";

interface ProfileSelectorProps {
  onSelect: (profile: ProfileType) => void;
}

const options: MenuOption<ProfileType>[] = PROFILES.map((profile: Profile) => ({
  id: profile.id,
  name: `${profile.icon} ${profile.name}`,
  description: profile.description,
}));

const ProfileHeader: React.FC = () => (
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
    <Text>Choose your workspace:</Text>
    <Text></Text>
  </Box>
);

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  onSelect,
}) => {
  return (
    <MenuSelector
      title=""
      options={options}
      onSelect={onSelect}
      customHeader={<ProfileHeader />}
    />
  );
};
