"use client";

import { useEffect, useState } from "react";
import { useFlash } from "next-smart-router/react";

export function FlashToaster() {
  const flash = useFlash();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!flash) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [flash]);

  if (!flash || !visible) return null;

  return (
    <div
      role="status"
      style={{ padding: "8px 12px", background: "#e3efe7", borderRadius: 6 }}
    >
      {flash.message}
    </div>
  );
}
