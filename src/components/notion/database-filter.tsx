import React, { useState, useMemo } from "react";
import { Text, Box, useInput } from "ink";
import { HelpFooter } from "../ui/HelpFooter.js";

export interface DatabaseProperty {
  name: string;
  type: string;
  options?: Array<{ name: string; id: string; color?: string }>;
}

export interface FilterCriteria {
  propertyName: string;
  propertyType: string;
  filterType: 'include' | 'exclude' | 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value?: string | string[] | number | boolean;
}

export interface DatabaseFilterProps {
  properties: DatabaseProperty[];
  onFilter: (criteria: FilterCriteria | null) => void;
  onSkip: () => void;
  onBack: () => void;
}

interface FilterOption {
  key: FilterCriteria['filterType'];
  label: string;
  shortLabel: string;
}

const getFilterOptionsForType = (propertyType: string): FilterOption[] => {
  switch (propertyType) {
    case 'select':
    case 'multi_select':
      return [
        { key: 'include', label: 'Include', shortLabel: 'incl' },
        { key: 'exclude', label: 'Exclude', shortLabel: 'excl' },
        { key: 'is_empty', label: 'Empty', shortLabel: 'empty' },
        { key: 'is_not_empty', label: 'Not Empty', shortLabel: '!empty' },
      ];
    case 'rich_text':
    case 'title':
      return [
        { key: 'contains', label: 'Contains', shortLabel: 'has' },
        { key: 'not_contains', label: 'Not Contains', shortLabel: '!has' },
        { key: 'is_empty', label: 'Empty', shortLabel: 'empty' },
        { key: 'is_not_empty', label: 'Not Empty', shortLabel: '!empty' },
      ];
    case 'checkbox':
      return [
        { key: 'equals', label: 'Checked', shortLabel: 'yes' },
        { key: 'not_equals', label: 'Unchecked', shortLabel: 'no' },
      ];
    case 'number':
      return [
        { key: 'equals', label: '=', shortLabel: '=' },
        { key: 'not_equals', label: '!=', shortLabel: '!=' },
        { key: 'greater_than', label: '>', shortLabel: '>' },
        { key: 'less_than', label: '<', shortLabel: '<' },
      ];
    default:
      return [];
  }
};

type Step = 'select' | 'values' | 'text-input';

export const DatabaseFilter: React.FC<DatabaseFilterProps> = ({
  properties,
  onFilter,
  onSkip,
  onBack,
}) => {
  const [step, setStep] = useState<Step>('select');
  const [selectedRow, setSelectedRow] = useState(0);
  const [filterTypeIndices, setFilterTypeIndices] = useState<Record<number, number>>({});
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [valueIndex, setValueIndex] = useState(0);
  const [textInput, setTextInput] = useState("");

  const filterableProperties = useMemo(() =>
    properties.filter(p =>
      ['select', 'multi_select', 'rich_text', 'title', 'checkbox', 'number'].includes(p.type)
    ),
    [properties]
  );

  const totalRows = filterableProperties.length + 2;

  const getFilterTypeIndex = (rowIndex: number): number => {
    return filterTypeIndices[rowIndex] ?? 0;
  };

  const setFilterTypeIndex = (rowIndex: number, index: number) => {
    setFilterTypeIndices(prev => ({ ...prev, [rowIndex]: index }));
  };

  const getCurrentProperty = (): DatabaseProperty | null => {
    if (selectedRow >= 1 && selectedRow <= filterableProperties.length) {
      return filterableProperties[selectedRow - 1];
    }
    return null;
  };

  const getCurrentFilterType = (): FilterOption | null => {
    const prop = getCurrentProperty();
    if (!prop) return null;
    const options = getFilterOptionsForType(prop.type);
    const idx = getFilterTypeIndex(selectedRow);
    return options[idx] || null;
  };

  useInput((input, key) => {
    if (step === 'select') {
      if (key.upArrow) {
        setSelectedRow(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedRow(prev => Math.min(totalRows - 1, prev + 1));
      } else if (key.leftArrow || key.rightArrow) {
        const prop = getCurrentProperty();
        if (prop) {
          const options = getFilterOptionsForType(prop.type);
          const currentIdx = getFilterTypeIndex(selectedRow);
          if (key.leftArrow) {
            setFilterTypeIndex(selectedRow, Math.max(0, currentIdx - 1));
          } else {
            setFilterTypeIndex(selectedRow, Math.min(options.length - 1, currentIdx + 1));
          }
        }
      } else if (key.return) {
        if (selectedRow === 0) {
          onSkip();
        } else if (selectedRow === totalRows - 1) {
          onBack();
        } else {
          const prop = getCurrentProperty();
          const filterType = getCurrentFilterType();
          if (prop && filterType) {
            if (filterType.key === 'is_empty' || filterType.key === 'is_not_empty') {
              onFilter({
                propertyName: prop.name,
                propertyType: prop.type,
                filterType: filterType.key,
              });
            } else if (prop.type === 'checkbox') {
              onFilter({
                propertyName: prop.name,
                propertyType: prop.type,
                filterType: filterType.key,
                value: filterType.key === 'equals',
              });
            } else if (prop.type === 'select' || prop.type === 'multi_select') {
              if (prop.options && prop.options.length > 0) {
                setStep('values');
                setValueIndex(0);
                setSelectedValues(new Set());
              }
            } else if (prop.type === 'rich_text' || prop.type === 'title' || prop.type === 'number') {
              setStep('text-input');
              setTextInput("");
            }
          }
        }
      } else if (input === 'b' || key.escape) {
        onBack();
      }
    } else if (step === 'values') {
      const prop = getCurrentProperty();
      const options = prop?.options || [];
      const totalOptions = options.length + 1; // +1 for "Done" button

      if (key.upArrow) {
        setValueIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setValueIndex(prev => Math.min(totalOptions - 1, prev + 1));
      } else if (key.return) {
        if (valueIndex < options.length) {
          // Toggle selection on Enter
          const optionName = options[valueIndex].name;
          setSelectedValues(prev => {
            const next = new Set(prev);
            if (next.has(optionName)) {
              next.delete(optionName);
            } else {
              next.add(optionName);
            }
            return next;
          });
        } else if (valueIndex === options.length && selectedValues.size > 0) {
          // "Done" button - apply filter
          const filterType = getCurrentFilterType();
          onFilter({
            propertyName: prop!.name,
            propertyType: prop!.type,
            filterType: filterType?.key || 'include',
            value: Array.from(selectedValues),
          });
        }
      } else if (key.escape || input === 'b') {
        setStep('select');
        setSelectedValues(new Set());
      }
    } else if (step === 'text-input') {
      if (key.return && textInput.trim()) {
        const prop = getCurrentProperty();
        const filterType = getCurrentFilterType();
        let value: string | number = textInput.trim();
        if (prop?.type === 'number') {
          value = parseFloat(textInput) || 0;
        }
        onFilter({
          propertyName: prop!.name,
          propertyType: prop!.type,
          filterType: filterType?.key || 'contains',
          value,
        });
      } else if (key.escape) {
        setStep('select');
        setTextInput("");
      } else if (key.backspace || key.delete) {
        setTextInput(prev => prev.slice(0, -1));
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setTextInput(prev => prev + input);
      }
    }
  });

  if (step === 'values') {
    const prop = getCurrentProperty();
    const filterType = getCurrentFilterType();
    const options = prop?.options || [];

    return (
      <Box flexDirection="column">
        <Text color="blue" bold>Filter: {prop?.name}</Text>
        <Text dimColor>Mode: {filterType?.label}</Text>
        <Text></Text>

        {options.map((option, index) => {
          const isSelected = valueIndex === index;
          const isChecked = selectedValues.has(option.name);
          return (
            <Box key={option.id}>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                <Text color={isChecked ? "green" : "gray"}>[{isChecked ? "x" : " "}]</Text>
                {" "}{option.name}
              </Text>
            </Box>
          );
        })}

        <Text></Text>
        <Box>
          <Text
            color={valueIndex === options.length ? "blue" : (selectedValues.size > 0 ? "green" : "gray")}
            bold={valueIndex === options.length}
          >
            Done ({selectedValues.size} selected)
          </Text>
        </Box>

        <Text></Text>
        <HelpFooter
          hints={[
            { keys: "↑/↓", action: "navigate" },
            { keys: "Enter", action: "toggle/apply" },
            { keys: "'b'", action: "back" },
          ]}
        />
      </Box>
    );
  }

  if (step === 'text-input') {
    const prop = getCurrentProperty();
    const filterType = getCurrentFilterType();
    const placeholder = prop?.type === 'number' ? 'Enter number...' : 'Enter text...';

    return (
      <Box flexDirection="column">
        <Text color="blue" bold>Filter: {prop?.name}</Text>
        <Text dimColor>Mode: {filterType?.label}</Text>
        <Text></Text>

        <Box>
          <Text color="cyan">{">"} </Text>
          <Text>{textInput || <Text dimColor>{placeholder}</Text>}</Text>
          <Text color="cyan">_</Text>
        </Box>

        <Text></Text>
        <Text dimColor>Type value, Enter: apply, Esc: cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>Filter Database Rows</Text>
      <Text dimColor>Select property and filter type, then press Enter</Text>
      <Text></Text>

      {/* Skip option */}
      <Box>
        <Text color={selectedRow === 0 ? "blue" : "white"} bold={selectedRow === 0}>
          Skip (process all rows)
        </Text>
      </Box>

      <Text></Text>

      {/* Properties with inline filter type selector */}
      {filterableProperties.map((prop, index) => {
        const rowIndex = index + 1;
        const isSelected = selectedRow === rowIndex;
        const filterOptions = getFilterOptionsForType(prop.type);
        const currentFilterIdx = getFilterTypeIndex(rowIndex);

        return (
          <Box key={prop.name} marginBottom={0}>
            <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
              {prop.name}
            </Text>
            <Text dimColor> ({prop.type}) </Text>
            {isSelected && (
              <Box>
                <Text dimColor>[</Text>
                {filterOptions.map((opt, optIdx) => (
                  <Text key={opt.key}>
                    <Text
                      color={optIdx === currentFilterIdx ? "green" : "gray"}
                      bold={optIdx === currentFilterIdx}
                    >
                      {opt.shortLabel}
                    </Text>
                    {optIdx < filterOptions.length - 1 && <Text dimColor> | </Text>}
                  </Text>
                ))}
                <Text dimColor>]</Text>
              </Box>
            )}
          </Box>
        );
      })}

      <Text></Text>

      {/* Back option */}
      <Box>
        <Text color={selectedRow === totalRows - 1 ? "blue" : "gray"} bold={selectedRow === totalRows - 1}>
          ← back
        </Text>
      </Box>

      <Text></Text>
      <HelpFooter
        hints={[
          { keys: "↑/↓", action: "select property" },
          { keys: "←/→", action: "change filter" },
          { keys: "Enter", action: "apply" },
          { keys: "'b'", action: "back" },
        ]}
      />
    </Box>
  );
};
