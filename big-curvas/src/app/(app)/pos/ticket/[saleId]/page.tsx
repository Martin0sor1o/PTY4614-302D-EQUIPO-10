import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { isAppError } from "@/lib/errors";
import { getSaleForActor } from "@/modules/sales";
import { PrintButton } from "@/components/pos/print-button";
import { Ticket } from "@/components/pos/ticket";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { posPageContext } from "../../context";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: PageProps<"/pos/ticket/[saleId]">) {
  const { user } = await posPageContext();
  const parsed = z.object({ saleId: z.string().min(1).max(64) }).safeParse(await params);
  if (!parsed.success) notFound();

  let sale;
  try {
    sale = await getSaleForActor(user, parsed.data.saleId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") redirect("/sin-acceso");
    throw error;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Venta {sale.number} registrada</h1>
          <p className="text-sm text-muted-foreground">El stock ya se descontó. Imprime el ticket o sigue con la próxima venta.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Link href="/pos" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-4")}>
            Nueva venta
          </Link>
          <Link href="/pos/ventas" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-4")}>
            Ventas del día
          </Link>
        </div>
      </div>
      <Ticket sale={sale} />
    </div>
  );
}
