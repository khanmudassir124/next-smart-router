// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTransfer,
  clearTransferFor,
  consumeFlash,
  initializeSmartRouter,
  peekFlash,
  readTransfer,
  resetSmartRouter,
  setConfig,
  subscribeTransfer,
  TRANSFER_KEY_PARAM,
  writeFlash,
  writeTransfer,
} from "../src/index";

beforeEach(() => {
  resetSmartRouter();
  initializeSmartRouter({ routes: ["/", "/checkout"], force: true });
  window.sessionStorage.clear();
  clearTransfer();
});

describe("session strategy (default)", () => {
  it("round-trips a payload keyed by destination path", () => {
    const href = writeTransfer("/checkout", { cart: [1, 2] });

    expect(href).toBe("/checkout");
    expect(readTransfer<{ cart: number[] }>("/checkout")).toEqual({ cart: [1, 2] });
  });

  it("ignores the query when addressing the payload", () => {
    writeTransfer("/checkout", { a: 1 });
    expect(readTransfer("/checkout?tab=x")).toEqual({ a: 1 });
  });

  it("returns undefined for a screen nothing was sent to", () => {
    expect(readTransfer("/checkout")).toBeUndefined();
  });

  it("expires a payload past its TTL", () => {
    vi.useFakeTimers();
    setConfig({ transfer: { ttlMs: 1000 } });

    writeTransfer("/checkout", { a: 1 });
    vi.advanceTimersByTime(500);
    expect(readTransfer("/checkout")).toEqual({ a: 1 });

    vi.advanceTimersByTime(1000);
    expect(readTransfer("/checkout")).toBeUndefined();
    vi.useRealTimers();
  });

  it("survives a page reload, since sessionStorage backs it", () => {
    writeTransfer("/checkout", { a: 1 });
    // A reload drops in-memory state but not sessionStorage.
    expect(window.sessionStorage.length).toBeGreaterThan(0);
    expect(readTransfer("/checkout")).toEqual({ a: 1 });
  });

  it("treats a corrupt entry as absent instead of throwing", () => {
    writeTransfer("/checkout", { a: 1 });
    const key = window.sessionStorage.key(0)!;
    window.sessionStorage.setItem(key, "{not json");

    expect(() => readTransfer("/checkout")).not.toThrow();
    expect(readTransfer("/checkout")).toBeUndefined();
  });

  it("clears one screen or all of them", () => {
    writeTransfer("/checkout", { a: 1 });
    clearTransferFor("/checkout");
    expect(readTransfer("/checkout")).toBeUndefined();

    writeTransfer("/checkout", { a: 1 });
    clearTransfer();
    expect(readTransfer("/checkout")).toBeUndefined();
  });
});

describe("url-key strategy", () => {
  it("puts a nonce in the URL so each history entry keeps its own payload", () => {
    const first = writeTransfer("/checkout", { step: 1 }, { strategy: "url-key" });
    const second = writeTransfer("/checkout", { step: 2 }, { strategy: "url-key" });

    expect(first).toContain(`${TRANSFER_KEY_PARAM}=`);
    expect(first).not.toBe(second);

    expect(readTransfer(first)).toEqual({ step: 1 });
    expect(readTransfer(second)).toEqual({ step: 2 });
  });

  it("resolves to undefined for a stale key from a shared link", () => {
    expect(readTransfer(`/checkout?${TRANSFER_KEY_PARAM}=deadbeef`)).toBeUndefined();
  });
});

describe("query strategy", () => {
  it("encodes the payload into the URL so it survives sharing", () => {
    const href = writeTransfer("/checkout", { a: 1 }, { strategy: "query" });

    expect(href).toContain(`${TRANSFER_KEY_PARAM}=`);
    // Readable with an empty store — the URL carries everything.
    clearTransfer();
    expect(readTransfer(href)).toEqual({ a: 1 });
  });
});

describe("memory strategy", () => {
  it("keeps nothing in storage", () => {
    writeTransfer("/checkout", { a: 1 }, { strategy: "memory" });
    expect(window.sessionStorage.length).toBe(0);
    expect(readTransfer("/checkout")).toEqual({ a: 1 });
  });
});

describe("lifecycle guardrails", () => {
  it("drops an oversized payload rather than blowing the quota", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setConfig({ transfer: { maxBytes: 64, onOverflow: "warn" } });

    writeTransfer("/checkout", { blob: "x".repeat(500) });

    expect(readTransfer("/checkout")).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws on overflow when configured to", () => {
    setConfig({ transfer: { maxBytes: 64, onOverflow: "throw" } });
    expect(() => writeTransfer("/checkout", { blob: "x".repeat(500) })).toThrow(
      /over the/
    );
  });

  it("evicts the oldest entries past maxEntries", () => {
    setConfig({ transfer: { maxEntries: 2 } });

    writeTransfer("/a", { n: 1 });
    writeTransfer("/b", { n: 2 });
    writeTransfer("/c", { n: 3 });

    expect(readTransfer("/a")).toBeUndefined();
    expect(readTransfer("/c")).toEqual({ n: 3 });
  });

  it("warns in dev about values that will not survive serialization", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    writeTransfer("/checkout", { onDone: () => {}, id: 1 });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("state.onDone is a function")
    );
    warn.mockRestore();
  });

  it("notifies subscribers on write and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTransfer(listener);

    writeTransfer("/checkout", { a: 1 });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    writeTransfer("/checkout", { a: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("flash messages", () => {
  it("is consumed exactly once", () => {
    writeFlash({ type: "success", message: "Workspace created" });

    expect(peekFlash()?.message).toBe("Workspace created");
    expect(consumeFlash()?.message).toBe("Workspace created");
    expect(consumeFlash()).toBeUndefined();
  });

  it("returns undefined when nothing is queued", () => {
    expect(consumeFlash()).toBeUndefined();
  });
});
