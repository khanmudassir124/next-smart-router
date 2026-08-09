"use client";

import { useRouteState, useSmartRouter } from "next-smart-router/react";

interface CartLine {
  sku: string;
  qty: number;
}

export function CheckoutSummary() {
  const nav = useSmartRouter();
  const state = useRouteState<{ cart: CartLine[]; view: string }>();

  // The whole point of the contract: this page works when opened cold.
  // Transfer state only skips the fetch, it never gates the render.
  if (!state) {
    return (
      <>
        <p>
          No handover data — you arrived here directly, refreshed, or opened a shared
          link. A real app would fetch the cart here.
        </p>
        <button onClick={() => nav.push("/w/42")}>Back to the workspace</button>
      </>
    );
  }

  return (
    <>
      <p>Handed over from the {state.view} view:</p>
      <ul>
        {state.cart.map((line) => (
          <li key={line.sku}>
            {line.sku} × {line.qty}
          </li>
        ))}
      </ul>
      <p style={{ opacity: 0.7, fontSize: 14 }}>
        Refresh this page — the payload survives (sessionStorage). Open it in a new tab
        and it is gone, as designed.
      </p>
    </>
  );
}
