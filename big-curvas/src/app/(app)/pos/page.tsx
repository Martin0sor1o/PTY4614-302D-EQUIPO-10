import { redirect } from "next/navigation";
import { formatTime } from "@/lib/dates";
import { getDiscountLimit, getOpenCashSession } from "@/modules/sales";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { posPageContext } from "./context";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const { user, location, problem } = await posPageContext();
  if (problem || !location) return problem;

  const session = await getOpenCashSession(user, location.id);
  if (!session) redirect("/pos/caja"); // no se puede vender sin caja abierta

  const limitBps = await getDiscountLimit();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Venta · {location.name}</h1>
        <p className="text-sm text-muted-foreground">
          Caja abierta desde las {formatTime(session.openedAt)} por {session.openedByName} · {session.salesCount}{" "}
          {session.salesCount === 1 ? "venta" : "ventas"}
        </p>
      </div>
      <PosTerminal locationName={location.name} limitBps={limitBps} isAdmin={user.role === "ADMIN"} />
    </div>
  );
}
