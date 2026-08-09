/**
 * A minimal in-memory navigation stack, independent of the browser history.
 *
 * Handy when you want a controllable back-stack (a modal flow, a nested
 * wizard) that is not tied to `window.history`.
 *
 * IMPORTANT: an instance holds one user's navigation state. Create one per
 * subtree with {@link createSmartHistory} — or use `SmartHistoryProvider` from
 * `next-smart-router/react`. The module-level {@link smartHistory} singleton
 * is a convenience for client-only code; never touch it during a server
 * render, where every concurrent request would share it.
 */

export interface SmartHistoryOptions {
  /** Cap the stack so a long session cannot grow without bound. Default 50. */
  maxLength?: number;
  /** Entry the stack starts with. */
  initial?: string;
}

export class SmartHistory {
  private stack: string[] = [];
  private readonly maxLength: number;
  private listeners = new Set<() => void>();

  constructor(options: SmartHistoryOptions = {}) {
    this.maxLength = Math.max(1, options.maxLength ?? 50);
    if (options.initial) this.stack = [options.initial];
  }

  /** Reset the stack to a single starting entry. */
  init(path: string): void {
    this.stack = [path];
    this.emit();
  }

  /** Push a new entry onto the stack. */
  push(path: string): void {
    this.stack.push(path);
    if (this.stack.length > this.maxLength) this.stack.shift();
    this.emit();
  }

  /** Replace the current entry. */
  replace(path: string): void {
    if (this.stack.length === 0) this.stack.push(path);
    else this.stack[this.stack.length - 1] = path;
    this.emit();
  }

  /** Pop the current entry and return the new current one. */
  back(): string {
    if (this.stack.length > 1) this.stack.pop();
    this.emit();
    return this.current();
  }

  /** Whether {@link back} would actually move. */
  canGoBack(): boolean {
    return this.stack.length > 1;
  }

  /** The current (top) entry, or "/" if empty. */
  current(): string {
    return this.stack[this.stack.length - 1] ?? "/";
  }

  /** Number of entries on the stack. */
  get length(): number {
    return this.stack.length;
  }

  /** A copy of the stack, oldest first. */
  entries(): string[] {
    return [...this.stack];
  }

  /** Reset to a single entry (alias of {@link init}). */
  reset(path: string): void {
    this.init(path);
  }

  /** Empty the stack entirely. */
  clear(): void {
    this.stack = [];
    this.emit();
  }

  /** Subscribe to stack changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Create an isolated navigation stack. Prefer this over the singleton. */
export function createSmartHistory(options: SmartHistoryOptions = {}): SmartHistory {
  return new SmartHistory(options);
}

/**
 * A shared instance, for client-only code that doesn't need isolation.
 *
 * @deprecated Prefer {@link createSmartHistory} or `SmartHistoryProvider`.
 * A module-level instance is shared across concurrent requests on the server.
 */
export const smartHistory = new SmartHistory();
