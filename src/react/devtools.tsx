"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { subscribeNavigation, type NavigationEvent } from "../core/events";
import { explainIn } from "../core/explain";
import { getRouteState, hasRoutes } from "../core/route-registry";
import { readTransfer } from "../core/transfer";
import { useLocationSearch } from "./use-location";

export interface SmartRouterDevtoolsProps {
  /** Corner to dock to. Default "bottom-right". */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Start expanded. Default false. */
  defaultOpen?: boolean;
}

const MAX_LOG = 12;
const MAX_NEAR_MISSES = 5;

/**
 * A development overlay showing what the router actually resolved.
 *
 * The "near misses" list walks the specificity ordering and shows which
 * patterns also matched but lost — the question that route-precedence bugs
 * always generate, answered without a debugger.
 *
 * @example
 * {process.env.NODE_ENV === "development" && <SmartRouterDevtools />}
 */
export function SmartRouterDevtools({
  position = "bottom-right",
  defaultOpen = false,
}: SmartRouterDevtoolsProps) {
  const pathname = usePathname() ?? "/";
  const search = useLocationSearch();
  const [open, setOpen] = useState(defaultOpen);
  const [log, setLog] = useState<NavigationEvent[]>([]);

  useEffect(
    () =>
      subscribeNavigation((event) => {
        setLog((previous) => [event, ...previous].slice(0, MAX_LOG));
      }),
    []
  );

  const href = search ? `${pathname}?${search}` : pathname;

  // One call answers every row below. `explainIn` walks the ordered routes
  // once and reports the winner, its rank, everything that also matched, and
  // the sticky selection — so this overlay no longer reimplements any of it.
  const explanation = useMemo(() => explainIn(getRouteState(), href), [href]);

  const match = explanation.winner;
  const rank = match?.rank ?? 0;
  const sticky = explanation.stickyQuery;
  // Core returns these uncapped; capping is the view's business.
  const nearMisses = explanation.nearMisses
    .slice(0, MAX_NEAR_MISSES)
    .map((n) => n.route);
  const transfer = typeof window === "undefined" ? undefined : readTransfer(href);

  const [vertical, horizontal] = position.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];

  return (
    <div
      style={{
        position: "fixed",
        [vertical]: 12,
        [horizontal]: 12,
        zIndex: 2147483000,
        font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#e6e9e7",
        background: "#161b19",
        border: "1px solid #2b3330",
        borderRadius: 6,
        boxShadow: "0 8px 32px rgba(0,0,0,.4)",
        maxWidth: 420,
        overflow: "hidden",
      }}
      data-nsr-devtools=""
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "6px 10px",
          width: "100%",
          boxSizing: "border-box",
          background: "#1b2220",
        }}
      >
        <span style={{ color: "#57c6b0" }}>next-smart-router</span>
        <span style={{ opacity: 0.7 }}>{match?.route ?? "no match"}</span>
        <span style={{ marginLeft: "auto", opacity: 0.5 }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div style={{ padding: "8px 10px", display: "grid", gap: 4 }}>
          {!hasRoutes() && (
            <Row
              label="warning"
              value="registry is empty — call initializeSmartRouter({ routes })"
              accent="#e9877b"
            />
          )}
          <Row label="pathname" value={pathname} />
          <Row
            label="matched"
            value={
              match ? `${match.route}   (nsr rank ${rank}/${explanation.total})` : "—"
            }
            accent={match ? "#57c6b0" : "#e9877b"}
          />
          <Row label="params" value={JSON.stringify(match?.params ?? {})} />
          <Row label="search" value={search ? `?${search}` : "—"} />
          {Object.keys(sticky).length > 0 && (
            <Row label="sticky" value={JSON.stringify(sticky)} />
          )}
          <Row
            label="transfer"
            value={transfer ? JSON.stringify(transfer).slice(0, 120) : "—"}
          />
          {nearMisses.length > 0 && (
            <Row label="also matched" value={nearMisses.join("  ")} accent="#d9a648" />
          )}
          {log.length > 0 && (
            <div
              style={{ marginTop: 6, borderTop: "1px solid #2b3330", paddingTop: 6 }}
            >
              <div style={{ opacity: 0.5, marginBottom: 2 }}>nav log</div>
              {log.map((event, index) => (
                <div key={index} style={{ opacity: 0.8 }}>
                  <span style={{ color: "#57c6b0" }}>{event.type}</span>{" "}
                  {event.route ?? event.to}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ opacity: 0.5, minWidth: 84 }}>{label}</span>
      <span style={{ color: accent, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}
