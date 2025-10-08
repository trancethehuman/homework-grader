import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

export interface DatabaseProperty {
  name: string;
  type: string;
  options?: Array<{ name: string; id: string; color?: string }>; // For select/multi-select
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

type FilterStep = 'select-property' | 'select-filter-type' | 'select-values';

export const DatabaseFilter: React.FC<DatabaseFilterProps> = ({
  properties,
  onFilter,
  onSkip,
  onBack,
}) => {
  const [step, setStep] = useState<FilterStep>('select-property');
  const [selectedPropertyIndex, setSelectedPropertyIndex] = useState(0);
  const [selectedFilterTypeIndex, setSelectedFilterTypeIndex] = useState(0);
  const [selectedProperty, setSelectedProperty] = useState<DatabaseProperty | null>(null);
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());

  // Filter to only show filterable property types
  const filterableProperties = properties.filter(p =>
    ['select', 'multi_select', 'rich_text', 'title', 'checkbox', 'number'].includes(p.type)
  );

  // Add "No Filter" and "Back" options
  const propertyOptions = [
    { name: 'No Filter - Process all rows', type: 'skip' },
    ...filterableProperties.map(p => ({ name: `${p.name} (${p.type})`, type: p.type, property: p })),
    { name: 'Back', type: 'back' }
  ];

  const getFilterTypeOptions = (propertyType: string): Array<{ key: string; label: string; description: string }> => {
    switch (propertyType) {
      case 'select':
      case 'multi_select':
        return [
          { key: 'include', label: 'Include selected options', description: 'Only process rows with these values' },
          { key: 'exclude', label: 'Exclude selected options', description: 'Skip rows with these values' },
          { key: 'is_empty', label: 'Is empty', description: 'Only process rows with no value' },
          { key: 'is_not_empty', label: 'Is not empty', description: 'Only process rows with any value' }
        ];
      case 'rich_text':
      case 'title':
        return [
          { key: 'contains', label: 'Contains keyword', description: 'Process rows containing this text' },
          { key: 'not_contains', label: 'Does not contain keyword', description: 'Skip rows containing this text' },
          { key: 'is_empty', label: 'Is empty', description: 'Only process rows with no value' },
          { key: 'is_not_empty', label: 'Is not empty', description: 'Only process rows with any value' }
        ];
      case 'checkbox':
        return [
          { key: 'equals', label: 'Is checked', description: 'Only process checked rows' },
          { key: 'not_equals', label: 'Is not checked', description: 'Only process unchecked rows' }
        ];
      case 'number':
        return [
          { key: 'equals', label: 'Equals', description: 'Process rows with this exact value' },
          { key: 'not_equals', label: 'Not equals', description: 'Skip rows with this value' },
          { key: 'greater_than', label: 'Greater than', description: 'Process rows greater than this value' },
          { key: 'less_than', label: 'Less than', description: 'Process rows less than this value' }
        ];
      default:
        return [];
    }
  };

  useInput((input, key) => {
    if (step === 'select-property') {
      if (key.upArrow && selectedPropertyIndex > 0) {
        setSelectedPropertyIndex(selectedPropertyIndex - 1);
      } else if (key.downArrow && selectedPropertyIndex < propertyOptions.length - 1) {
        setSelectedPropertyIndex(selectedPropertyIndex + 1);
      } else if (key.return) {
        const selected = propertyOptions[selectedPropertyIndex];
        if (selected.type === 'skip') {
          onSkip();
        } else if (selected.type === 'back') {
          onBack();
        } else if ('property' in selected && selected.property) {
          setSelectedProperty(selected.property);
          setStep('select-filter-type');
          setSelectedFilterTypeIndex(0);
        }
      }
    } else if (step === 'select-filter-type') {
      const filterTypeOptions = getFilterTypeOptions(selectedProperty!.type);

      if (key.upArrow && selectedFilterTypeIndex > 0) {
        setSelectedFilterTypeIndex(selectedFilterTypeIndex - 1);
      } else if (key.downArrow && selectedFilterTypeIndex < filterTypeOptions.length - 1) {
        setSelectedFilterTypeIndex(selectedFilterTypeIndex + 1);
      } else if (key.return) {
        const selectedFilterType = filterTypeOptions[selectedFilterTypeIndex].key;

        // For is_empty/is_not_empty, apply filter immediately
        if (selectedFilterType === 'is_empty' || selectedFilterType === 'is_not_empty') {
          onFilter({
            propertyName: selectedProperty!.name,
            propertyType: selectedProperty!.type,
            filterType: selectedFilterType as FilterCriteria['filterType']
          });
        } else if (selectedProperty!.type === 'select' || selectedProperty!.type === 'multi_select') {
          // For select/multi-select, go to value selection
          setStep('select-values');
        } else {
          // For text/number/checkbox, we'd need an input step (simplified for now)
          // For this implementation, just apply a basic filter
          onFilter({
            propertyName: selectedProperty!.name,
            propertyType: selectedProperty!.type,
            filterType: selectedFilterType as FilterCriteria['filterType'],
            value: selectedProperty!.type === 'checkbox' ? true : ''
          });
        }
      } else if (key.backspace || key.escape) {
        setStep('select-property');
        setSelectedProperty(null);
      }
    } else if (step === 'select-values') {
      const options = selectedProperty!.options || [];

      if (key.upArrow && selectedFilterTypeIndex > 0) {
        setSelectedFilterTypeIndex(selectedFilterTypeIndex - 1);
      } else if (key.downArrow && selectedFilterTypeIndex < options.length) {
        setSelectedFilterTypeIndex(selectedFilterTypeIndex + 1);
      } else if (input === ' ' && selectedFilterTypeIndex < options.length) {
        // Toggle selection with spacebar
        const optionName = options[selectedFilterTypeIndex].name;
        const newSelected = new Set(selectedValues);
        if (newSelected.has(optionName)) {
          newSelected.delete(optionName);
        } else {
          newSelected.add(optionName);
        }
        setSelectedValues(newSelected);
      } else if (key.return) {
        // Apply filter with selected values
        if (selectedFilterTypeIndex === options.length) {
          // "Apply Filter" option selected
          if (selectedValues.size > 0) {
            const filterTypeOptions = getFilterTypeOptions(selectedProperty!.type);
            const currentFilterType = filterTypeOptions.find((_, i) => i === 0); // Get the filter type from previous step

            onFilter({
              propertyName: selectedProperty!.name,
              propertyType: selectedProperty!.type,
              filterType: selectedValues.size > 0 ? 'include' : 'is_not_empty',
              value: Array.from(selectedValues)
            });
          }
        }
      } else if (key.backspace || key.escape) {
        setStep('select-filter-type');
        setSelectedValues(new Set());
      }
    }
  });

  if (step === 'select-property') {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="cyan" bold>
          Optional: Filter Database Rows
        </Text>
        <Text></Text>
        <Text>
          Select a field to filter by, or skip to process all rows:
        </Text>
        <Text></Text>

        {propertyOptions.map((option, index) => (
          <Box key={index}>
            <Text color={selectedPropertyIndex === index ? "cyan" : "white"}>
              {selectedPropertyIndex === index ? "→ " : "  "}
              {option.name}
            </Text>
          </Box>
        ))}

        <Text></Text>
        <Text color="gray" dimColor>
          [Use arrow keys to navigate, press Enter to select]
        </Text>
      </Box>
    );
  }

  if (step === 'select-filter-type') {
    const filterTypeOptions = getFilterTypeOptions(selectedProperty!.type);

    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="cyan" bold>
          Filter by: {selectedProperty!.name}
        </Text>
        <Text></Text>
        <Text>
          Select filter type:
        </Text>
        <Text></Text>

        {filterTypeOptions.map((option, index) => (
          <Box key={option.key} flexDirection="column" marginBottom={1}>
            <Text color={selectedFilterTypeIndex === index ? "cyan" : "white"} bold={selectedFilterTypeIndex === index}>
              {selectedFilterTypeIndex === index ? "→ " : "  "}{option.label}
            </Text>
            <Box marginLeft={4}>
              <Text color="gray" dimColor>
                {option.description}
              </Text>
            </Box>
          </Box>
        ))}

        <Text></Text>
        <Text color="gray" dimColor>
          [Arrow keys to navigate, Enter to select, Backspace to go back]
        </Text>
      </Box>
    );
  }

  if (step === 'select-values') {
    const options = selectedProperty!.options || [];

    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="cyan" bold>
          Select values to include
        </Text>
        <Text></Text>
        <Text>
          Use spacebar to toggle selection, Enter when done:
        </Text>
        <Text></Text>

        {options.map((option, index) => (
          <Box key={option.id}>
            <Text color={selectedFilterTypeIndex === index ? "cyan" : "white"}>
              {selectedFilterTypeIndex === index ? "→ " : "  "}
              [{selectedValues.has(option.name) ? "✓" : " "}] {option.name}
            </Text>
          </Box>
        ))}

        <Box marginTop={1}>
          <Text color={selectedFilterTypeIndex === options.length ? "cyan" : "white"} bold>
            {selectedFilterTypeIndex === options.length ? "→ " : "  "}
            Apply Filter ({selectedValues.size} selected)
          </Text>
        </Box>

        <Text></Text>
        <Text color="gray" dimColor>
          [Space to toggle, Arrow keys to navigate, Enter to apply, Backspace to go back]
        </Text>
      </Box>
    );
  }

  return null;
};
