"use client";

import { createContext, useContext } from "react";

/**
 * What a brick on the canvas can ask the editor to do, beyond selecting
 * it. Handed down as context rather than through node data so the
 * graph stays plain data and the bricks stay memoised.
 */
export type CanvasActions = {
  /** Try this brick on its own; absent when the canvas is read-only. */
  onTest?: (nodeId: string) => void;
};

const CanvasActionsContext = createContext<CanvasActions>({});

export const CanvasActionsProvider = CanvasActionsContext.Provider;

export function useCanvasActions(): CanvasActions {
  return useContext(CanvasActionsContext);
}
