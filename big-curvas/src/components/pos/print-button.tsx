"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" size="lg" className="h-11 px-4" onClick={() => window.print()}>
      <Printer /> Imprimir
    </Button>
  );
}
