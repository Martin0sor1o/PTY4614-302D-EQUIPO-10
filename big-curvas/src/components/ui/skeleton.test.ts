import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import KardexLoading from "@/app/(app)/stock/[variantId]/kardex/loading";
import ReportsLoading from "@/app/(app)/reportes/loading";
import StockLoading from "@/app/(app)/stock/loading";

const SCREENS: [string, ComponentType, string][] = [
  ["Reportes", ReportsLoading, "Cargando reportes…"],
  ["Stock", StockLoading, "Cargando stock…"],
  ["Kardex", KardexLoading, "Cargando kardex…"],
];

describe("esqueletos de carga", () => {
  it.each(SCREENS)("%s: dice qué carga, y la silueta es decorativa y respeta el movimiento reducido", (_name, Loading, label) => {
    const html = renderToStaticMarkup(createElement(Loading));
    expect(html).toContain('role="status"');
    expect(html).toContain(label);
    const blocks = html.match(/<div aria-hidden="true" data-slot="skeleton"[^>]*>/g) ?? [];
    expect(blocks.length).toBeGreaterThan(3);
    for (const block of blocks) expect(block).toContain("motion-reduce:animate-none");
    expect(html).not.toMatch(/<(button|input|a)\b/);
  });
});
