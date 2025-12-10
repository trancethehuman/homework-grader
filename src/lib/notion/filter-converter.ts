import { FilterCriteria } from "../../components/notion/database-filter.js";

/**
 * Notion API filter object type.
 * This represents the filter structure expected by the Notion API.
 */
export interface NotionFilter {
  property?: string;
  select?: { equals?: string; does_not_equal?: string; is_empty?: boolean; is_not_empty?: boolean };
  multi_select?: { contains?: string; does_not_contain?: string; is_empty?: boolean; is_not_empty?: boolean };
  rich_text?: { contains?: string; does_not_contain?: string; is_empty?: boolean; is_not_empty?: boolean };
  checkbox?: { equals?: boolean };
  number?: { equals?: number; does_not_equal?: number; greater_than?: number; less_than?: number };
  or?: NotionFilter[];
  and?: NotionFilter[];
}

/**
 * Converts a FilterCriteria object to a Notion API filter format.
 * @param criteria The filter criteria from the UI
 * @returns A Notion API compatible filter object, or undefined if conversion fails
 */
export function convertFilterToNotionAPI(criteria: FilterCriteria): NotionFilter | undefined {
  const propertyName = criteria.propertyName;

  switch (criteria.filterType) {
    case "include":
      if (criteria.propertyType === "select") {
        const values = criteria.value as string[];
        if (values.length === 1) {
          return {
            property: propertyName,
            select: { equals: values[0] },
          };
        }
        return {
          or: values.map((val: string) => ({
            property: propertyName,
            select: { equals: val },
          })),
        };
      } else if (criteria.propertyType === "multi_select") {
        const values = criteria.value as string[];
        if (values.length === 1) {
          return {
            property: propertyName,
            multi_select: { contains: values[0] },
          };
        }
        return {
          or: values.map((val: string) => ({
            property: propertyName,
            multi_select: { contains: val },
          })),
        };
      }
      break;

    case "exclude":
      if (criteria.propertyType === "select") {
        const values = criteria.value as string[];
        if (values.length === 1) {
          return {
            property: propertyName,
            select: { does_not_equal: values[0] },
          };
        }
        return {
          and: values.map((val: string) => ({
            property: propertyName,
            select: { does_not_equal: val },
          })),
        };
      } else if (criteria.propertyType === "multi_select") {
        const values = criteria.value as string[];
        if (values.length === 1) {
          return {
            property: propertyName,
            multi_select: { does_not_contain: values[0] },
          };
        }
        return {
          and: values.map((val: string) => ({
            property: propertyName,
            multi_select: { does_not_contain: val },
          })),
        };
      }
      break;

    case "contains":
      return {
        property: propertyName,
        rich_text: { contains: criteria.value as string },
      };

    case "not_contains":
      return {
        property: propertyName,
        rich_text: { does_not_contain: criteria.value as string },
      };

    case "equals":
      if (criteria.propertyType === "checkbox") {
        return {
          property: propertyName,
          checkbox: { equals: criteria.value as boolean },
        };
      } else if (criteria.propertyType === "number") {
        return {
          property: propertyName,
          number: { equals: criteria.value as number },
        };
      }
      break;

    case "not_equals":
      if (criteria.propertyType === "checkbox") {
        return {
          property: propertyName,
          checkbox: { equals: !(criteria.value as boolean) },
        };
      } else if (criteria.propertyType === "number") {
        return {
          property: propertyName,
          number: { does_not_equal: criteria.value as number },
        };
      }
      break;

    case "greater_than":
      return {
        property: propertyName,
        number: { greater_than: criteria.value as number },
      };

    case "less_than":
      return {
        property: propertyName,
        number: { less_than: criteria.value as number },
      };

    case "is_empty":
      if (criteria.propertyType === "select") {
        return {
          property: propertyName,
          select: { is_empty: true },
        };
      } else if (criteria.propertyType === "multi_select") {
        return {
          property: propertyName,
          multi_select: { is_empty: true },
        };
      } else if (
        criteria.propertyType === "rich_text" ||
        criteria.propertyType === "title"
      ) {
        return {
          property: propertyName,
          rich_text: { is_empty: true },
        };
      }
      break;

    case "is_not_empty":
      if (criteria.propertyType === "select") {
        return {
          property: propertyName,
          select: { is_not_empty: true },
        };
      } else if (criteria.propertyType === "multi_select") {
        return {
          property: propertyName,
          multi_select: { is_not_empty: true },
        };
      } else if (
        criteria.propertyType === "rich_text" ||
        criteria.propertyType === "title"
      ) {
        return {
          property: propertyName,
          rich_text: { is_not_empty: true },
        };
      }
      break;
  }

  return undefined;
}
