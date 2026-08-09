"use client";

import { parseAsString } from "next-smart-router";
import { useQueryState, useQueryStates, useSmartRouter } from "next-smart-router/react";

import { workspaceSearch } from "./search-params";

export function WorkspaceControls() {
  const nav = useSmartRouter();

  // The same definition the server page parses — no drift, no re-declaration.
  // One navigation per call, not one per key.
  const [{ view, page }, setFilters] = useQueryStates(workspaceSearch);

  // Client-only filter: shallow, so no RSC round-trip per keystroke.
  const [q, setQ] = useQueryState("q", parseAsString.default(""), {
    shallow: true,
    throttleMs: 200,
  });

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setFilters({ view: "grid", page: 1 })}>Grid</button>
        <button onClick={() => setFilters({ view: "list", page: 1 })}>List</button>
        <button onClick={() => setFilters((prev) => ({ page: prev.page + 1 }))}>
          Page {page} →
        </button>
      </div>

      <input
        value={q}
        placeholder="Filter (shallow — watch the URL, not the network)"
        onChange={(event) => setQ(event.target.value)}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => nav.sibling("members")}>Members (relative)</button>
        <button onClick={() => nav.fsBack()}>fsBack (never a 404)</button>
        <button
          onClick={() =>
            nav.push("/checkout", {
              state: { cart: [{ sku: "abc", qty: 2 }], view },
              flash: { type: "success", message: "Cart handed over" },
            })
          }
        >
          Checkout, carrying state
        </button>
      </div>
    </div>
  );
}
