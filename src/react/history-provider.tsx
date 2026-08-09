"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { createSmartHistory, type SmartHistory } from "../core/history";

const SmartHistoryContext = createContext<SmartHistory | null>(null);

export interface SmartHistoryProviderProps {
  children: ReactNode;
  /** First entry on the stack. */
  initial?: string;
  /** Cap the stack length. Default 50. */
  maxLength?: number;
  /** Supply your own instance instead of creating one. */
  history?: SmartHistory;
}

/**
 * Scope a navigation stack to a subtree — a modal flow, a nested wizard.
 *
 * Prefer this over the exported `smartHistory` singleton: an instance holds
 * one user's navigation state, and a module-level one is shared across every
 * concurrent request on the server.
 */
export function SmartHistoryProvider({
  children,
  initial,
  maxLength,
  history,
}: SmartHistoryProviderProps) {
  const created = useRef<SmartHistory | null>(null);
  if (!created.current) {
    created.current = history ?? createSmartHistory({ initial, maxLength });
  }

  const value = history ?? created.current;

  return (
    <SmartHistoryContext.Provider value={value}>
      {children}
    </SmartHistoryContext.Provider>
  );
}

export interface UseSmartHistoryResult {
  current: string;
  length: number;
  canGoBack: boolean;
  entries: string[];
  push: (path: string) => void;
  replace: (path: string) => void;
  back: () => string;
  reset: (path: string) => void;
  clear: () => void;
}

/** Read and drive the nearest {@link SmartHistoryProvider}'s stack. */
export function useSmartHistory(): UseSmartHistoryResult {
  const history = useContext(SmartHistoryContext);

  if (!history) {
    throw new Error(
      "next-smart-router: useSmartHistory() must be used inside a <SmartHistoryProvider>."
    );
  }

  const snapshot = useSyncExternalStore(
    (listener) => history.subscribe(listener),
    () => history.current(),
    () => history.current()
  );

  return useMemo(
    () => ({
      current: snapshot,
      length: history.length,
      canGoBack: history.canGoBack(),
      entries: history.entries(),
      push: (path: string) => history.push(path),
      replace: (path: string) => history.replace(path),
      back: () => history.back(),
      reset: (path: string) => history.reset(path),
      clear: () => history.clear(),
    }),
    [history, snapshot]
  );
}
