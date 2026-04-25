"use no memo";

import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * JS wrapper to isolate the virtualizer library.
 */
export function useVirtualizerBridge(config) {
  return useVirtualizer(config);
}
