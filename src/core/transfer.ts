/**
 * Cross-screen transfer: a payload scoped to one navigation, that cleans
 * itself up.
 *
 * The design rule that shapes everything here: transfer state is never
 * authoritative. It is an optimization — a way to skip a spinner for data the
 * previous screen already had in hand. Every consumer must still work when it
 * is absent, because a direct link, a refresh, a shared URL and a cold back
 * navigation all produce exactly that.
 */

import { getConfig, type TransferConfig, type TransferStrategy } from "./config";
import { isDev, warnOnce } from "./dev-warn";
import { toPathname, withQuery, parseQuery } from "./url";

export interface TransferEnvelope<T = unknown> {
  /** Envelope format version, so stored payloads can be migrated. */
  v: 1;
  /** Creation timestamp, for TTL. */
  t: number;
  data: T;
}

/** The query key used by the "url-key" strategy. */
export const TRANSFER_KEY_PARAM = "_nsr";

const memory = new Map<string, TransferEnvelope>();
const listeners = new Set<() => void>();

function config(): TransferConfig {
  return getConfig().transfer;
}

function storageKey(key: string): string {
  return `${config().namespace}:t:${key}`;
}

function session(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    // Private-mode Safari and some embedded webviews throw on access.
    return null;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to transfer-store changes. Used by `useRouteState`. */
export function subscribeTransfer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* -------------------------------------------------
 * Serialization guardrails
 * ------------------------------------------------- */

function findUnserializable(value: unknown, path = "state"): string[] {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function") return [`${path} is a function`];
    if (typeof value === "symbol") return [`${path} is a symbol`];
    if (typeof value === "bigint") return [`${path} is a bigint`];
    return [];
  }

  if (typeof Element !== "undefined" && value instanceof Element) {
    return [`${path} is a DOM element`];
  }
  if (value instanceof Map || value instanceof Set) {
    return [`${path} is a ${value.constructor.name} (serializes to {})`];
  }

  const issues: string[] = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    issues.push(...findUnserializable(item, `${path}.${key}`));
  }
  return issues;
}

function assertSerializable(data: unknown): void {
  if (!isDev()) return;

  const issues = findUnserializable(data);
  if (!issues.length) return;

  warnOnce(
    `unserializable:${issues[0]}`,
    "transfer state must be JSON-serializable.\n" +
      issues.map((i) => `    ${i}`).join("\n") +
      "\n  These will be dropped. Pass an id and re-resolve on arrival."
  );
}

/* -------------------------------------------------
 * Read / write
 * ------------------------------------------------- */

/**
 * Memoized `JSON.parse`, keyed by the exact raw string it came from.
 *
 * `useRouteState` reads through `useSyncExternalStore`, which compares
 * snapshots with `Object.is` — parsing afresh on every read would hand React a
 * new object each time and spin forever. Reusing the envelope keeps the
 * identity stable while the stored string is unchanged.
 */
const parsed = new Map<string, { raw: string; envelope: TransferEnvelope }>();

function parseEnvelope(cacheKey: string, raw: string): TransferEnvelope | null {
  const hit = parsed.get(cacheKey);
  if (hit && hit.raw === raw) return hit.envelope;

  try {
    const envelope = JSON.parse(raw) as TransferEnvelope;
    parsed.set(cacheKey, { raw, envelope });
    return envelope;
  } catch {
    parsed.delete(cacheKey);
    return null;
  }
}

function readEnvelope(
  key: string,
  strategy: TransferStrategy
): TransferEnvelope | null {
  if (strategy === "memory") return memory.get(key) ?? null;

  const store = session();
  if (!store) return memory.get(key) ?? null;

  const storeKey = storageKey(key);
  const raw = store.getItem(storeKey);
  if (!raw) return null;

  const envelope = parseEnvelope(storeKey, raw);
  if (!envelope) store.removeItem(storeKey);
  return envelope;
}

function writeEnvelope(
  key: string,
  envelope: TransferEnvelope,
  strategy: TransferStrategy
): void {
  if (strategy === "memory") {
    memory.set(key, envelope);
    evictMemory();
    return;
  }

  const store = session();
  if (!store) {
    memory.set(key, envelope);
    evictMemory();
    return;
  }

  try {
    store.setItem(storageKey(key), JSON.stringify(envelope));
    evictSession(store);
  } catch {
    // Quota exceeded — fall back to memory rather than losing the navigation.
    memory.set(key, envelope);
  }
}

function evictMemory(): void {
  const { maxEntries } = config();
  while (memory.size > maxEntries) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

function evictSession(store: Storage): void {
  const { maxEntries, namespace } = config();
  const prefix = `${namespace}:t:`;
  const entries: Array<{ key: string; t: number }> = [];

  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const envelope = JSON.parse(store.getItem(key) ?? "") as TransferEnvelope;
      entries.push({ key, t: envelope.t ?? 0 });
    } catch {
      store.removeItem(key);
    }
  }

  if (entries.length <= maxEntries) return;

  entries.sort((a, b) => a.t - b.t);
  for (const entry of entries.slice(0, entries.length - maxEntries)) {
    store.removeItem(entry.key);
  }
}

function byteLength(json: string): number {
  return typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(json).length
    : json.length;
}

export interface WriteTransferOptions {
  strategy?: TransferStrategy;
}

/**
 * Stash `data` for the next screen and return the href that should be
 * navigated to (unchanged, unless the strategy needs a key in the URL).
 */
export function writeTransfer(
  href: string,
  data: unknown,
  options: WriteTransferOptions = {}
): string {
  const settings = config();
  const strategy = options.strategy ?? settings.strategy;

  assertSerializable(data);

  if (strategy === "query") {
    // The payload IS the URL — shareable, but small.
    return withQuery(href, { [TRANSFER_KEY_PARAM]: encodePayload(data) });
  }

  const envelope: TransferEnvelope = { v: 1, t: Date.now(), data };
  const json = JSON.stringify(envelope);
  const size = byteLength(json);

  if (size > settings.maxBytes) {
    const message =
      `transfer payload is ${Math.round(size / 1024)} KB, over the ` +
      `${Math.round(settings.maxBytes / 1024)} KB limit.`;

    if (settings.onOverflow === "throw")
      throw new Error(`next-smart-router: ${message}`);
    if (settings.onOverflow === "warn") warnOnce(`overflow:${href}`, message);
    return href; // dropped
  }

  if (strategy === "url-key") {
    const key = randomKey();
    writeEnvelope(key, envelope, "session");
    notify();
    return withQuery(href, { [TRANSFER_KEY_PARAM]: key });
  }

  // "session" and "memory": keyed by destination pathname.
  writeEnvelope(toPathname(href), envelope, strategy);
  notify();
  return href;
}

/** Read the payload addressed to `href`, or `undefined`. */
export function readTransfer<T>(href: string): T | undefined {
  const settings = config();
  const query = parseQuery(href);
  const urlKey = query[TRANSFER_KEY_PARAM];

  if (typeof urlKey === "string") {
    const decoded = decodePayload<T>(urlKey);
    if (decoded !== undefined) return decoded;

    const envelope = readEnvelope(urlKey, "session");
    return unwrap<T>(envelope, settings);
  }

  const key = toPathname(href);
  const envelope = readEnvelope(key, settings.strategy) ?? readEnvelope(key, "memory");
  return unwrap<T>(envelope, settings);
}

function unwrap<T>(
  envelope: TransferEnvelope | null,
  settings: TransferConfig
): T | undefined {
  if (!envelope) return undefined;
  if (settings.ttlMs > 0 && Date.now() - envelope.t > settings.ttlMs) {
    return undefined;
  }
  return envelope.data as T;
}

/** Drop the payload addressed to `href`. */
export function clearTransferFor(href: string): void {
  const key = toPathname(href);
  memory.delete(key);
  parsed.delete(storageKey(key));
  session()?.removeItem(storageKey(key));

  const urlKey = parseQuery(href)[TRANSFER_KEY_PARAM];
  if (typeof urlKey === "string") {
    memory.delete(urlKey);
    session()?.removeItem(storageKey(urlKey));
  }
  notify();
}

/** Drop every payload in this app's namespace. Call this on sign-out. */
export function clearTransfer(): void {
  memory.clear();
  parsed.clear();

  const store = session();
  if (store) {
    const prefix = `${config().namespace}:t:`;
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(prefix)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  }

  notify();
}

/* -------------------------------------------------
 * Flash messages
 * ------------------------------------------------- */

export interface FlashMessage {
  type: "success" | "error" | "info" | "warning";
  message: string;
  /** Anything else the toast needs. */
  [key: string]: unknown;
}

function flashKey(): string {
  return `${config().namespace}:flash`;
}

/** Queue a one-shot message for the next screen. */
export function writeFlash(flash: FlashMessage): void {
  const envelope: TransferEnvelope<FlashMessage> = { v: 1, t: Date.now(), data: flash };
  const store = session();

  if (store) {
    try {
      store.setItem(flashKey(), JSON.stringify(envelope));
    } catch {
      memory.set("__flash", envelope);
    }
  } else {
    memory.set("__flash", envelope);
  }
  notify();
}

/** Read and remove the pending flash message. */
export function consumeFlash(): FlashMessage | undefined {
  const store = session();
  let envelope: TransferEnvelope<FlashMessage> | null = null;

  if (store) {
    const raw = store.getItem(flashKey());
    if (raw) {
      try {
        envelope = JSON.parse(raw) as TransferEnvelope<FlashMessage>;
      } catch {
        /* corrupt entry — treated as absent */
      }
      store.removeItem(flashKey());
    }
  }

  if (!envelope) {
    envelope = (memory.get("__flash") as TransferEnvelope<FlashMessage>) ?? null;
    memory.delete("__flash");
  }

  if (!envelope) return undefined;
  notify();
  return unwrap<FlashMessage>(envelope, config());
}

/** Peek at the pending flash without consuming it. */
export function peekFlash(): FlashMessage | undefined {
  const store = session();
  const raw = store?.getItem(flashKey());
  if (raw) {
    try {
      return unwrap<FlashMessage>(
        JSON.parse(raw) as TransferEnvelope<FlashMessage>,
        config()
      );
    } catch {
      return undefined;
    }
  }
  return unwrap<FlashMessage>(
    (memory.get("__flash") as TransferEnvelope<FlashMessage>) ?? null,
    config()
  );
}

/* -------------------------------------------------
 * "query" strategy payload encoding
 * ------------------------------------------------- */

function encodePayload(data: unknown): string {
  const json = JSON.stringify({ v: 1, t: Date.now(), data });
  return typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
    : Buffer.from(json, "utf8").toString("base64url");
}

function decodePayload<T>(raw: string): T | undefined {
  // A "url-key" nonce is short and opaque; a "query" payload is base64 JSON.
  if (raw.length < 24) return undefined;

  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? decodeURIComponent(escape(atob(padded)))
        : Buffer.from(padded, "base64").toString("utf8");

    // Memoized for the same reason storage reads are — see `parseEnvelope`.
    const envelope = parseEnvelope(`q:${raw}`, json) as TransferEnvelope<T> | null;
    return envelope ? unwrap<T>(envelope, config()) : undefined;
  } catch {
    return undefined;
  }
}

function randomKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

/** Reset every store. Intended for tests. */
export function resetTransfer(): void {
  memory.clear();
  parsed.clear();
  clearTransfer();
}
