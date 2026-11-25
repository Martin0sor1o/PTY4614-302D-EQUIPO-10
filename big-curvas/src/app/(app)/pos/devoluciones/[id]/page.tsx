import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { isAppError } from "@/lib/errors";
import { requirePageAccess } from "@/modules/auth";
import { getReturn } from "@/modules/returns";
import { PrintButton } from "@/components/pos/print-button";
import { ReturnReceipt } from "@/components/pos/return-receipt";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Comprobante de devolución" };

export default async function ReturnReceiptPage({ params }: PageProps<"/pos/devoluciones/[id]">) {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA"]);
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(await params);
  if (!parsed.success) notFound();

  let ret;
  try {
    ret = await getReturn(user, parsed.data.id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") redirect("/sin-acceso");
    throw error;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {ret.type === "CAMBIO" ? "Cambio" : "Devolución"} {ret.number} registrado
          </h1>
          <p className="text-sm text-muted-foreground">El stock ya se actualizó. Imprime el comprobante{ret.voucher && ret.voucher.balance > 0 ? " (lleva el código del vale)" : ""} o sigue atendiendo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Link href="/pos/devoluciones" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-4")}>
            Otra devolución
          </Link>
          <Link href="/pos" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-4")}>
            Volver a vender
          </Link>
        </div>
      </div>
      <ReturnReceipt ret={ret} />
    </div>
  );
}
