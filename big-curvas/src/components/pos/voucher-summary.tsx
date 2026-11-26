import { formatCLP } from "@/lib/money";

/** Vales de una caja (informativo: no mueven efectivo). No dibuja nada si no hubo vales. */
export function VoucherSummary({ issued, redeemed, exchangeCredit }: { issued: number; redeemed: number; exchangeCredit: number }) {
  if (issued <= 0 && redeemed <= 0) return null;
  return (
    <div className="text-sm" data-testid="voucher-summary">
      <div className="mb-1 font-medium">Vales (no mueven efectivo)</div>
      <ul className="grid max-w-md grid-cols-2 gap-x-6 gap-y-0.5">
        <li>
          <span className="text-muted-foreground">Emitidos en esta caja</span>
          <div className="font-medium tabular-nums" data-testid="vouchers-issued">{formatCLP(issued)}</div>
        </li>
        <li>
          <span className="text-muted-foreground">Canjeados en ventas</span>
          <div className="font-medium tabular-nums" data-testid="vouchers-redeemed">{formatCLP(redeemed)}</div>
          {exchangeCredit > 0 && (
            <div className="text-xs text-muted-foreground" data-testid="vouchers-exchange-credit">
              (incluye {formatCLP(exchangeCredit)} de crédito por cambio)
            </div>
          )}
        </li>
      </ul>
    </div>
  );
}
