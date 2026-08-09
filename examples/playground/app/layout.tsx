import type { ReactNode } from "react";
import { SmartRouterDevtools } from "next-smart-router/react";

import { SmartRouterSetup } from "@/components/smart-router-setup";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FlashToaster } from "@/components/flash-toaster";

export const metadata = { title: "next-smart-router playground" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720 }}>
        <SmartRouterSetup />
        <FlashToaster />
        <Breadcrumbs />
        <main>{children}</main>
        {process.env.NODE_ENV === "development" && <SmartRouterDevtools />}
      </body>
    </html>
  );
}
