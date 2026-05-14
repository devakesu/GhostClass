"use no memo";

import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * JS wrapper to isolate the virtualizer library.
 */
export function useVirtualizerBridge(config) {
  // eslint-disable-next-line react-hooks/incompatible-library
  return useVirtualizer(config);
}
