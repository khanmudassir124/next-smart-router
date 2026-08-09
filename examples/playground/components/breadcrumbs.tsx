"use client";

import { SmartLink, useBreadcrumbs } from "next-smart-router/react";

export function Breadcrumbs() {
  const crumbs = useBreadcrumbs({ format: "title", includeRoot: true });

  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: 16, fontSize: 14 }}>
      {crumbs.map((crumb, index) => (
        <span key={crumb.href}>
          {index > 0 && <span style={{ opacity: 0.4 }}> / </span>}
          {crumb.isCurrent ? (
            <span aria-current="page">{crumb.label}</span>
          ) : (
            <SmartLink href={crumb.href}>{crumb.label}</SmartLink>
          )}
        </span>
      ))}
    </nav>
  );
}
