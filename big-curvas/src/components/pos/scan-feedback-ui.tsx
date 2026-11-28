"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import type { ScanNotice } from "./scan-feedback";

export const FLASH_MS = 900;

const FLASH_STYLE = {
  // Va DETRÁS del contenido (el padre necesita `relative isolate`): no cambia el texto ni tapa controles.
  line: "-z-10 bg-tone-ok-soft shadow-[inset_0_0_0_2px_var(--tone-ok),inset_6px_0_0_0_var(--tone-ok)]",
  alert: "rounded-2xl shadow-[inset_0_0_0_3px_var(--tone-danger)]",
} as const;

/**
 * Destello breve. Es decorativo (el texto ya dice qué pasó), no mueve nada ni recibe clics. Para repetirlo se le
 * cambia la `key`. Con movimiento reducido no se anima: queda fijo ese mismo rato (globals.css `.scan-flash`).
 */
export function Flash({ tone }: { tone: keyof typeof FLASH_STYLE }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), FLASH_MS);
    return () => clearTimeout(t);
  }, []);
  if (done) return null;
  return <span aria-hidden data-testid={`flash-${tone}`} className={cn("scan-flash pointer-events-none absolute inset-0", FLASH_STYLE[tone])} />;
}

/** El aviso junto al campo de escaneo. La región existe siempre, para que el lector de pantalla anuncie lo que aparece. */
export function ScanNoticeRegion({ notice }: { notice: ScanNotice | null }) {
  return (
    <div role="status" aria-live="polite">
      {notice && (
        <Notice key={notice.id} tone={notice.tone} title={notice.title} className="relative py-2" data-testid="scan-notice">
          {notice.text}
          {notice.tone === "danger" && <Flash tone="alert" />}
        </Notice>
      )}
    </div>
  );
}

export function BeepToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const Icon = on ? Volume2 : VolumeX;
  return (
    <Button type="button" variant="outline" size="sm" role="switch" aria-checked={on} aria-label="Sonido al agregar" onClick={onToggle} data-testid="beep-toggle">
      <Icon aria-hidden /> Sonido al agregar: {on ? "activado" : "apagado"}
    </Button>
  );
}
