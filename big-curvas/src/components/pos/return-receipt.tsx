import { formatDate, formatDateTime } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { RETURN_REASON_LABEL, type ReturnReasonCode, type ReturnView } from "@/modules/returns/client";

const DESTINATION: Record<string, string> = {
  EFECTIVO: "Reembolso en efectivo",
  TRANSFERENCIA: "Reembolso por transferencia",
  ANULACION_TRANSBANK: "Anulación en la máquina",
  VALE: "Vale",
  NINGUNO: "Cambio",
};

/** Comprobante de una devolución o cambio (y del vale, con su código). En pantalla es una tira; al imprimir ocupa 80 mm. */
export function ReturnReceipt({ ret }: { ret: ReturnView }) {
  return (
    <article className="ticket mx-auto w-[80mm] max-w-full bg-paper p-3 font-mono text-[12px] leading-snug text-paper-ink shadow-sm ring-1 ring-paper-ink/10" aria-label={`Comprobante ${ret.number}`}>
      <div className="text-center">
        <div className="text-lg font-extrabold tracking-[0.12em]">BIG CURVAS</div>
        <div className="font-semibold">{ret.location.name}</div>
        <div className="mt-1 font-bold tracking-widest">{ret.type === "CAMBIO" ? "COMPROBANTE DE CAMBIO" : "COMPROBANTE DE DEVOLUCIÓN"}</div>
      </div>
      <hr className="my-2 border-dashed border-paper-ink" />
      <div className="flex justify-between">
        <span>N°</span>
        <span className="font-bold" data-testid="return-number">{ret.number}</span>
      </div>
      <div className="flex justify-between">
        <span>Fecha</span>
        <span>{formatDateTime(ret.createdAt)}</span>
      </div>
      <div className="flex justify-between">
        <span>Venta original</span>
        <span>{ret.sale.number}</span>
      </div>
      <div className="flex justify-between">
        <span>Atendió</span>
        <span>{ret.userName}</span>
      </div>
      <div className="flex justify-between">
        <span>Motivo</span>
        <span>{RETURN_REASON_LABEL[ret.reason as ReturnReasonCode] ?? ret.reason}</span>
      </div>
      {ret.reasonNote && <div className="text-[11px]">“{ret.reasonNote}”</div>}

      <hr className="my-2 border-dashed border-paper-ink" />
      <ul className="space-y-1.5">
        {ret.lines.map((l) => (
          <li key={l.saleLineId}>
            <div className="font-semibold">
              {l.productName} · {l.color} · T{l.size}
            </div>
            <div className="flex justify-between">
              <span>
                {l.qty} × {l.condition === "DANADA" ? "dañada" : "vendible"}
              </span>
              <span>{formatCLP(l.amount)}</span>
            </div>
          </li>
        ))}
      </ul>

      <hr className="my-2 border-dashed border-paper-ink" />
      <div className="flex justify-between text-sm font-extrabold">
        <span>VALOR DEVUELTO</span>
        <span>{formatCLP(ret.valueReturned)}</span>
      </div>
      <div className="flex justify-between">
        <span>Destino</span>
        <span>{DESTINATION[ret.refundMethod] ?? ret.refundMethod}</span>
      </div>
      {ret.refundAmount > 0 && (
        <div className="flex justify-between">
          <span>Devuelto{ret.roundingAdjustment !== 0 ? ` (redondeo ${formatCLP(ret.roundingAdjustment)})` : ""}</span>
          <span data-testid="refund-amount">{formatCLP(ret.refundAmount)}</span>
        </div>
      )}
      {ret.refundReference && (
        <div className="flex justify-between">
          <span>Referencia</span>
          <span>{ret.refundReference}</span>
        </div>
      )}
      {ret.newSale && (
        <div className="flex justify-between">
          <span>Venta del cambio</span>
          <span>
            {ret.newSale.number} · {formatCLP(ret.newSale.total)}
          </span>
        </div>
      )}

      {ret.voucher && ret.voucher.balance > 0 && (
        <>
          <hr className="my-2 border-dashed border-paper-ink" />
          <div className="border-2 border-paper-ink p-2 text-center" data-testid="voucher-box">
            <div className="font-extrabold tracking-widest">VALE</div>
            <div className="my-1 text-[15px] font-extrabold tracking-wider" data-testid="voucher-code">{ret.voucher.code}</div>
            <div>
              Saldo: <strong>{formatCLP(ret.voucher.balance)}</strong>
            </div>
            <div className="text-[11px]">Vence el {formatDate(ret.voucher.expiresAt)} · no es nominativo · uso parcial</div>
            <div className="mt-1 text-[10px]">Quien tiene el código puede usar el vale: guárdalo bien.</div>
          </div>
        </>
      )}
      <p className="mt-3 text-center text-[11px]">Gracias por tu compra</p>
    </article>
  );
}
