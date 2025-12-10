import React from "react";
import { Text, Box } from "ink";

export interface ListRowProps {
  isSelected: boolean;
  highlightColor?: string;
  children: React.ReactNode;
  indicator?: string;
  showIndicator?: boolean;
  marginBottom?: number;
}

export const ListRow: React.FC<ListRowProps> = ({
  isSelected,
  highlightColor = "blue",
  children,
  indicator = "→",
  showIndicator = true,
  marginBottom = 0,
}) => {
  return (
    <Box marginBottom={marginBottom}>
      {showIndicator && (
        <Text color={isSelected ? highlightColor : undefined}>
          {isSelected ? `${indicator} ` : "  "}
        </Text>
      )}
      {children}
    </Box>
  );
};

export interface ListRowTitleProps {
  title: string;
  isSelected: boolean;
  highlightColor?: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  actionHint?: string;
  actionHintColor?: string;
  disabled?: boolean;
}

export const ListRowTitle: React.FC<ListRowTitleProps> = ({
  title,
  isSelected,
  highlightColor = "blue",
  subtitle,
  badge,
  badgeColor,
  actionHint,
  actionHintColor = "green",
  disabled = false,
}) => {
  return (
    <Box>
      <Text
        color={disabled ? "gray" : isSelected ? highlightColor : "white"}
        bold={isSelected && !disabled}
      >
        {title}
      </Text>
      {subtitle && <Text dimColor> ({subtitle})</Text>}
      {badge && (
        <Text color={badgeColor}> [{badge}]</Text>
      )}
      {actionHint && isSelected && (
        <Text color={actionHintColor}> [{actionHint}]</Text>
      )}
    </Box>
  );
};

export interface ListRowDetailsProps {
  children: React.ReactNode;
  indent?: number;
}

export const ListRowDetails: React.FC<ListRowDetailsProps> = ({
  children,
  indent = 4,
}) => {
  return (
    <Box marginLeft={indent}>
      <Text dimColor>{children}</Text>
    </Box>
  );
};

export interface ConfidenceBadgeProps {
  confidence: number;
  showLabel?: boolean;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  confidence,
  showLabel = true,
}) => {
  const getConfidenceColor = (conf: number): string => {
    if (conf >= 80) return "green";
    if (conf >= 60) return "yellow";
    return "red";
  };

  const getConfidenceLabel = (conf: number): string => {
    if (conf >= 80) return "High";
    if (conf >= 60) return "Medium";
    return "Low";
  };

  const color = getConfidenceColor(confidence);
  const label = getConfidenceLabel(confidence);

  return (
    <Text color={color}>
      [{showLabel ? `${label} confidence - ` : ""}{confidence}%]
    </Text>
  );
};

export interface StatusIndicatorProps {
  status: "pending" | "loading" | "success" | "error" | "warning" | "cancelling";
  label?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
}) => {
  const statusConfig: Record<
    StatusIndicatorProps["status"],
    { icon: string; color: string }
  > = {
    pending: { icon: "○", color: "gray" },
    loading: { icon: "◐", color: "cyan" },
    success: { icon: "✓", color: "green" },
    error: { icon: "✗", color: "red" },
    warning: { icon: "⚠", color: "yellow" },
    cancelling: { icon: "⏳", color: "yellow" },
  };

  const config = statusConfig[status];

  return (
    <Text color={config.color}>
      {config.icon}
      {label && ` ${label}`}
    </Text>
  );
};
