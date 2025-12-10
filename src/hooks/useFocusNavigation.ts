import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useInput, Key } from "ink";

export type RegionType = "list" | "input" | "button";

export interface ListRegionConfig {
  type: "list";
  id: string;
  itemCount: number;
  viewportSize?: number;
  enabled?: boolean;
  onSelect?: (index: number) => void;
}

export interface InputRegionConfig {
  type: "input";
  id: string;
  enabled?: boolean;
  onSubmit?: (value: string) => void;
  reservedKeys?: string[];
}

export interface ButtonRegionConfig {
  type: "button";
  id: string;
  enabled?: boolean;
  onActivate?: () => void;
}

export type RegionConfig =
  | ListRegionConfig
  | InputRegionConfig
  | ButtonRegionConfig;

export interface UseFocusNavigationOptions {
  regions: RegionConfig[];
  initialFocus?: string;
  wrapNavigation?: boolean;
  disabled?: boolean;
  onFocusChange?: (regionId: string, previousRegionId: string | null) => void;
}

export interface ListRegionState {
  type: "list";
  selectedIndex: number;
  scrollOffset: number;
  visibleRange: { start: number; end: number };
  isAtTop: boolean;
  isAtBottom: boolean;
  isFocused: boolean;
}

export interface InputRegionState {
  type: "input";
  value: string;
  isFocused: boolean;
}

export interface ButtonRegionState {
  type: "button";
  isFocused: boolean;
}

export type RegionState = ListRegionState | InputRegionState | ButtonRegionState;

export interface UseFocusNavigationResult {
  focusedRegion: string;
  regionStates: Record<string, RegionState>;

  focusRegion: (regionId: string) => void;
  focusNext: () => void;
  focusPrevious: () => void;

  listScrollUp: (regionId: string) => void;
  listScrollDown: (regionId: string) => void;
  listSelectIndex: (regionId: string, index: number) => void;

  inputSetValue: (regionId: string, value: string) => void;
  inputAppendChar: (regionId: string, char: string) => void;
  inputDeleteChar: (regionId: string) => void;

  isRegionFocused: (regionId: string) => boolean;
  getEnabledRegions: () => string[];
}

interface ListInternalState {
  selectedIndex: number;
  scrollOffset: number;
}

interface InputInternalState {
  value: string;
}

function getEnabledRegionOrder(regions: RegionConfig[]): string[] {
  return regions.filter((r) => r.enabled !== false).map((r) => r.id);
}

function getNextRegion(
  currentId: string,
  order: string[],
  wrap: boolean
): string | null {
  const currentIndex = order.indexOf(currentId);
  if (currentIndex === -1) return order[0] ?? null;

  const nextIndex = currentIndex + 1;
  if (nextIndex >= order.length) {
    return wrap ? order[0] : null;
  }
  return order[nextIndex];
}

function getPreviousRegion(
  currentId: string,
  order: string[],
  wrap: boolean
): string | null {
  const currentIndex = order.indexOf(currentId);
  if (currentIndex === -1) return order[order.length - 1] ?? null;

  const prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    return wrap ? order[order.length - 1] : null;
  }
  return order[prevIndex];
}

export function useFocusNavigation(
  options: UseFocusNavigationOptions
): UseFocusNavigationResult {
  const {
    regions,
    initialFocus,
    wrapNavigation = false,
    disabled = false,
    onFocusChange,
  } = options;

  const regionsRef = useRef(regions);
  regionsRef.current = regions;

  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;

  const enabledOrderKey = regions
    .filter((r) => r.enabled !== false)
    .map((r) => r.id)
    .join(",");

  const enabledOrder = useMemo(
    () => getEnabledRegionOrder(regions),
    [enabledOrderKey]
  );

  const [focusedRegionId, setFocusedRegionId] = useState(() => {
    const enabledRegions = regions.filter((r) => r.enabled !== false);
    if (initialFocus && enabledRegions.some((r) => r.id === initialFocus)) {
      return initialFocus;
    }
    return enabledRegions[0]?.id ?? "";
  });

  const [listStates, setListStates] = useState<Map<string, ListInternalState>>(
    () => {
      const map = new Map<string, ListInternalState>();
      regions
        .filter((r) => r.type === "list")
        .forEach((r) => {
          map.set(r.id, { selectedIndex: 0, scrollOffset: 0 });
        });
      return map;
    }
  );

  const [inputStates, setInputStates] = useState<
    Map<string, InputInternalState>
  >(() => {
    const map = new Map<string, InputInternalState>();
    regions
      .filter((r) => r.type === "input")
      .forEach((r) => {
        map.set(r.id, { value: "" });
      });
    return map;
  });

  useEffect(() => {
    if (!enabledOrder.includes(focusedRegionId) && enabledOrder.length > 0) {
      setFocusedRegionId(enabledOrder[0]);
    }
  }, [enabledOrderKey]);

  const focusRegion = useCallback(
    (regionId: string) => {
      setFocusedRegionId((prev) => {
        const currentEnabledOrder = getEnabledRegionOrder(regionsRef.current);
        if (!currentEnabledOrder.includes(regionId)) return prev;

        if (prev !== regionId) {
          onFocusChangeRef.current?.(regionId, prev);
        }
        return regionId;
      });
    },
    []
  );

  const focusNext = useCallback(() => {
    setFocusedRegionId((prev) => {
      const currentEnabledOrder = getEnabledRegionOrder(regionsRef.current);
      const next = getNextRegion(prev, currentEnabledOrder, wrapNavigation);
      if (next && next !== prev) {
        onFocusChangeRef.current?.(next, prev);
        return next;
      }
      return prev;
    });
  }, [wrapNavigation]);

  const focusPrevious = useCallback(() => {
    setFocusedRegionId((prev) => {
      const currentEnabledOrder = getEnabledRegionOrder(regionsRef.current);
      const next = getPreviousRegion(prev, currentEnabledOrder, wrapNavigation);
      if (next && next !== prev) {
        onFocusChangeRef.current?.(next, prev);
        return next;
      }
      return prev;
    });
  }, [wrapNavigation]);

  const listScrollUp = useCallback((regionId: string) => {
    setListStates((prev) => {
      const newMap = new Map(prev);
      const state = newMap.get(regionId);
      if (!state) return prev;

      const newIndex = Math.max(0, state.selectedIndex - 1);
      let newScrollOffset = state.scrollOffset;

      if (newIndex < state.scrollOffset) {
        newScrollOffset = newIndex;
      }

      newMap.set(regionId, {
        selectedIndex: newIndex,
        scrollOffset: newScrollOffset,
      });
      return newMap;
    });
  }, []);

  const listScrollDown = useCallback((regionId: string) => {
    setListStates((prev) => {
      const config = regionsRef.current.find(
        (r) => r.id === regionId && r.type === "list"
      ) as ListRegionConfig | undefined;
      if (!config) return prev;

      const viewportSize = config.viewportSize ?? 8;
      const newMap = new Map(prev);
      const state = newMap.get(regionId);
      if (!state) return prev;

      const newIndex = Math.min(config.itemCount - 1, state.selectedIndex + 1);
      let newScrollOffset = state.scrollOffset;

      if (newIndex >= state.scrollOffset + viewportSize) {
        newScrollOffset = newIndex - viewportSize + 1;
      }

      newMap.set(regionId, {
        selectedIndex: newIndex,
        scrollOffset: newScrollOffset,
      });
      return newMap;
    });
  }, []);

  const listSelectIndex = useCallback((regionId: string, index: number) => {
    setListStates((prev) => {
      const config = regionsRef.current.find(
        (r) => r.id === regionId && r.type === "list"
      ) as ListRegionConfig | undefined;
      if (!config) return prev;

      const viewportSize = config.viewportSize ?? 8;
      const clampedIndex = Math.max(0, Math.min(config.itemCount - 1, index));

      const newMap = new Map(prev);
      const state = newMap.get(regionId);
      if (!state) return prev;

      let newScrollOffset = state.scrollOffset;

      if (clampedIndex < state.scrollOffset) {
        newScrollOffset = clampedIndex;
      } else if (clampedIndex >= state.scrollOffset + viewportSize) {
        newScrollOffset = clampedIndex - viewportSize + 1;
      }

      newMap.set(regionId, {
        selectedIndex: clampedIndex,
        scrollOffset: newScrollOffset,
      });
      return newMap;
    });
  }, []);

  const inputSetValue = useCallback((regionId: string, value: string) => {
    setInputStates((prev) => {
      const newMap = new Map(prev);
      newMap.set(regionId, { value });
      return newMap;
    });
  }, []);

  const inputAppendChar = useCallback((regionId: string, char: string) => {
    setInputStates((prev) => {
      const newMap = new Map(prev);
      const state = newMap.get(regionId);
      if (!state) return prev;
      newMap.set(regionId, { value: state.value + char });
      return newMap;
    });
  }, []);

  const inputDeleteChar = useCallback((regionId: string) => {
    setInputStates((prev) => {
      const newMap = new Map(prev);
      const state = newMap.get(regionId);
      if (!state) return prev;
      newMap.set(regionId, { value: state.value.slice(0, -1) });
      return newMap;
    });
  }, []);

  const isRegionFocused = useCallback(
    (regionId: string) => focusedRegionId === regionId,
    [focusedRegionId]
  );

  const getEnabledRegions = useCallback(() => enabledOrder, [enabledOrder]);

  useInput(
    (input: string, key: Key) => {
      if (disabled) return;

      const currentRegions = regionsRef.current;
      const currentRegion = currentRegions.find((r) => r.id === focusedRegionId);
      if (!currentRegion || currentRegion.enabled === false) return;

      if (key.upArrow) {
        if (currentRegion.type === "list") {
          const state = listStates.get(currentRegion.id);
          if (state && state.selectedIndex > 0) {
            listScrollUp(currentRegion.id);
            return;
          }
        }
        focusPrevious();
        return;
      }

      if (key.downArrow) {
        if (currentRegion.type === "list") {
          const config = currentRegion as ListRegionConfig;
          const state = listStates.get(currentRegion.id);
          if (state && state.selectedIndex < config.itemCount - 1) {
            listScrollDown(currentRegion.id);
            return;
          }
        }
        focusNext();
        return;
      }

      if (key.return) {
        if (currentRegion.type === "list") {
          const config = currentRegion as ListRegionConfig;
          const state = listStates.get(currentRegion.id);
          config.onSelect?.(state?.selectedIndex ?? 0);
        } else if (currentRegion.type === "button") {
          const config = currentRegion as ButtonRegionConfig;
          config.onActivate?.();
        } else if (currentRegion.type === "input") {
          const config = currentRegion as InputRegionConfig;
          const state = inputStates.get(currentRegion.id);
          config.onSubmit?.(state?.value ?? "");
        }
        return;
      }

      if (currentRegion.type === "input") {
        if (key.backspace || key.delete) {
          inputDeleteChar(currentRegion.id);
          return;
        }
        if (input && input.length === 1 && !key.ctrl && !key.meta) {
          inputAppendChar(currentRegion.id, input);
          return;
        }
      }

      if (currentRegion.type !== "input") {
        if (input && input.length === 1 && !key.ctrl && !key.meta && !key.escape) {
          const inputRegion = currentRegions.find(
            (r) => r.type === "input" && r.enabled !== false
          ) as InputRegionConfig | undefined;

          if (inputRegion) {
            const reservedKeys = inputRegion.reservedKeys ?? [];
            if (!reservedKeys.includes(input.toLowerCase())) {
              focusRegion(inputRegion.id);
              inputAppendChar(inputRegion.id, input);
              return;
            }
          }
        }
      }
    },
    { isActive: !disabled }
  );

  const regionStates = useMemo(() => {
    const states: Record<string, RegionState> = {};
    const currentRegions = regionsRef.current;

    for (const region of currentRegions) {
      if (region.type === "list") {
        const config = region as ListRegionConfig;
        const state = listStates.get(region.id) ?? {
          selectedIndex: 0,
          scrollOffset: 0,
        };
        const viewportSize = config.viewportSize ?? 8;

        states[region.id] = {
          type: "list",
          selectedIndex: state.selectedIndex,
          scrollOffset: state.scrollOffset,
          visibleRange: {
            start: state.scrollOffset,
            end: Math.min(state.scrollOffset + viewportSize, config.itemCount),
          },
          isAtTop: state.selectedIndex === 0,
          isAtBottom: state.selectedIndex === config.itemCount - 1,
          isFocused: focusedRegionId === region.id,
        };
      } else if (region.type === "input") {
        const state = inputStates.get(region.id) ?? { value: "" };
        states[region.id] = {
          type: "input",
          value: state.value,
          isFocused: focusedRegionId === region.id,
        };
      } else if (region.type === "button") {
        states[region.id] = {
          type: "button",
          isFocused: focusedRegionId === region.id,
        };
      }
    }

    return states;
  }, [listStates, inputStates, focusedRegionId, enabledOrderKey]);

  return {
    focusedRegion: focusedRegionId,
    regionStates,
    focusRegion,
    focusNext,
    focusPrevious,
    listScrollUp,
    listScrollDown,
    listSelectIndex,
    inputSetValue,
    inputAppendChar,
    inputDeleteChar,
    isRegionFocused,
    getEnabledRegions,
  };
}
