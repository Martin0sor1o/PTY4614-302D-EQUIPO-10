import { formatDateTime } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import type { SaleView } from "@/modules/sales/client";

export const METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  TRANSFERENCIA: "Transferencia",
  VALE: "Vale",
};

const REFERENCE_LABEL: Record<string, string> = { DEBITO: "Voucher", CREDITO: "Voucher", TRANSFERENCIA: "Referencia" };

/** Ticket de venta. En pantalla se ve como una tira; al imprimir (globals.css `.ticket`) ocupa 80 mm. */
export function Ticket({ sale }: { sale: SaleView }) {
  const payment = sale.payments[0];
  return (
    <article className="ticket mx-auto w-[80mm] max-w-full bg-white p-3 font-mono text-[12px] leading-snug text-black shadow-sm ring-1 ring-black/10" aria-label={`Ticket ${sale.number}`}>
      <div className="text-center">
        <div className="text-lg font-extrabold tracking-[0.12em]">BIG CURVAS</div>
        <div className="font-semibold">{sale.location.name}</div>
        {sale.location.address && <div>{sale.location.address}</div>}
      </div>

      <hr className="my-2 border-dashed border-black" />
      <div className="flex justify-between">
        <span>Venta N°</span>
        <span className="font-bold" data-testid="ticket-number">
          {sale.number}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Fecha</span>
        <span>{formatDateTime(sale.createdAt)}</span>
      </div>
      <div className="flex justify-between">
        <span>Atendió</span>
        <span>{sale.sellerName}</span>
      </div>

      <hr className="my-2 border-dashed border-black" />
      <ul className="space-y-1.5">
        {sale.lines.map((l) => (
          <li key={l.variantId + l.unitPrice + l.discountBps}>
            <div className="font-semibold">
              {l.productName} · {l.color} · T{l.size}
            </div>
            <div className="flex justify-between">
              <span>
                {l.quantity} x {formatCLP(l.unitPrice)}
              </span>
              <span>{formatCLP(l.quantity * l.unitPrice)}</span>
            </div>
            {l.discount > 0 && (
              <div className="flex justify-between">
                <span>Dcto. {l.discountBps / 100} %</span>
                <span>-{formatCLP(l.discount)}</span>
              </div>
            )}
            <div className="text-[10px]">{l.sku}</div>
          </li>
        ))}
      </ul>

      <hr className="my-2 border-dashed border-black" />
      <dl className="space-y-0.5">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatCLP(sale.subtotal)}</dd>
        </div>
        {sale.discountTotal > 0 && (
          <div className="flex justify-between">
            <dt>Descuentos</dt>
            <dd>-{formatCLP(sale.discountTotal)}</dd>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold">
          <dt>TOTAL</dt>
          <dd data-testid="ticket-total">{formatCLP(sale.total)}</dd>
        </div>
        {sale.roundingAdjustment !== 0 && (
          <div className="flex justify-between">
            <dt>Redondeo efectivo</dt>
            <dd>{sale.roundingAdjustment > 0 ? "+" : ""}{formatCLP(sale.roundingAdjustment)}</dd>
          </div>
        )}
      </dl>

      {payment && (
        <>
          <hr className="my-2 border-dashed border-black" />
          <dl className="space-y-0.5">
            <div className="flex justify-between font-semibold">
              <dt>Medio de pago</dt>
              <dd>{METHOD_LABEL[payment.method]}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Cobrado</dt>
              <dd>{formatCLP(payment.amount)}</dd>
            </div>
            {payment.reference && (
              <div className="flex justify-between">
                <dt>{REFERENCE_LABEL[payment.method] ?? "Referencia"}</dt>
                <dd>{payment.reference}</dd>
              </div>
            )}
            {payment.cashReceived !== null && (
              <>
                <div className="flex justify-between">
                  <dt>Recibido</dt>
                  <dd>{formatCLP(payment.cashReceived)}</dd>
                </div>
                <div className="flex justify-between font-bold">
                  <dt>Vuelto</dt>
                  <dd data-testid="ticket-change">{formatCLP(payment.change ?? 0)}</dd>
                </div>
              </>
            )}
          </dl>
        </>
      )}

      <hr className="my-2 border-dashed border-black" />
      <div className="text-center">
        <div className="font-bold">Comprobante interno – no válido como boleta</div>
        <div>¡Gracias por tu compra!</div>
      </div>
    </article>
  );
}
