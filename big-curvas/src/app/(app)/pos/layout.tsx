import type { ReactNode } from "react";
import { PosTabs } from "@/components/pos/pos-tabs";

export default function PosLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <PosTabs />
      {children}
    </div>
  );
}
