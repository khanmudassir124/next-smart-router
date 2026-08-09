"use client";

import { useState } from "react";
import { useNavigationGuard, useSmartRouter } from "next-smart-router/react";

export function SettingsForm() {
  const [name, setName] = useState("");
  const nav = useSmartRouter();

  // Blocks nav.push / SmartLink clicks, and warns on tab close.
  useNavigationGuard({ when: name.length > 0 });

  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
      <input
        value={name}
        placeholder="Type here, then try to navigate away"
        onChange={(event) => setName(event.target.value)}
      />
      <button onClick={() => nav.sibling("members")}>Go to members</button>
    </div>
  );
}
