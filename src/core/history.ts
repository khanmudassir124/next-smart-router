/**
 * A minimal in-memory navigation stack, independent of the browser history.
 *
 * Handy when you want a controllable back-stack (e.g. inside a modal flow or a
 * nested wizard) that is not tied to `window.history`.
 */
class SmartHistory {
  private stack: string[] = [];

  /** Reset the stack to a single starting entry. */
  init(path: string): void {
    this.stack = [path];
  }

  /** Push a new entry onto the stack. */
  push(path: string): void {
    this.stack.push(path);
  }

  /** Pop the current entry and return the new current one. */
  back(): string {
    if (this.stack.length > 1) this.stack.pop();
    return this.current();
  }

  /** The current (top) entry, or "/" if empty. */
  current(): string {
    return this.stack[this.stack.length - 1] ?? "/";
  }

  /** Reset to a single entry (alias of {@link init}). */
  reset(path: string): void {
    this.init(path);
  }
}

export const smartHistory = new SmartHistory();
export type { SmartHistory };
