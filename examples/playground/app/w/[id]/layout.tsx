"use client";

import type { ReactNode } from "react";
import { SmartLink, useChildren } from "next-smart-router/react";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  // The tabs come from the filesystem. Add app/w/[id]/billing/page.tsx and the
  // tab appears — there is no menu array to keep in sync.
  const tabs = useChildren("./");

  return (
    <>
      <nav style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {tabs.map((tab) => (
          <SmartLink
            key={tab.path}
            href={`./${tab.segment}`}
            activeClassName="active"
            style={{ textTransform: "capitalize" }}
          >
            {tab.meta?.title ?? tab.segment}
          </SmartLink>
        ))}
      </nav>
      {children}
    </>
  );
}
