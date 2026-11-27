# Preguntas para Belén: cambios, devoluciones y vales

Lista que se llevó a la reunión del **26/11/2026**. Cada fila es una regla que **el sistema ya aplicaba con un valor propuesto**. Belén confirmó las filas 1 a 12 tal como están escritas, sin cambios de valores. La fila 13 **no tiene respuesta** y sigue como supuesto 🟡. Si más adelante cambia una respuesta, el cambio es acotado: los números se editan en la configuración (`settings`) y el resto vive en un solo archivo (`src/modules/returns/rules.ts`).

Referencias: ADR-021 (`07_DECISIONES_Y_PREGUNTAS.md`), requisitos RF-DEV-01 a 07 y reglas RN-10, 11, 15, 16, 17 y 24 (`02_REQUERIMIENTOS.md`).

## Preguntas y respuestas

| N° | Pregunta para Belén | Lo que hace hoy el sistema | Respuesta de Belén | Fecha | Dónde se cambia | Preguntas del doc 07 |
|----|---------------------|----------------------------|--------------------|-------|-----------------|----------------------|
| 1 | ¿Cuántos días tiene la clienta para cambiar o devolver? | **30 días** desde la compra (en pedidos online, desde que se entrega). Pasado el plazo, la vendedora necesita que Belén lo apruebe. | ✅ Confirmada sin cambios. Su aplicación a pedidos online ya entregados sigue abierta (fila 13, Q-01) | 26/11/2026 | Configuración `return_window_days` | P-09 (S-01) |
| 2 | ¿Se puede devolver algo que no está registrado como venta en el sistema? | **No.** Solo se devuelve lo que aparece en una venta registrada y no anulada. Un pedido online solo se puede devolver si ya salió (despachado o entregado). | ✅ Confirmada sin cambios. Su aplicación a pedidos online ya entregados sigue abierta (fila 13, Q-01) | 26/11/2026 | Código (`rules.ts`) | P-09 (S-02) |
| 3 | ¿Qué hacemos con una prenda que vuelve dañada? | La vendedora marca si está **vendible** (sin uso, con etiqueta) o **dañada**. La dañada no vuelve a venderse: queda registrada como merma. | ✅ Confirmada sin cambios | 26/11/2026 | Código | P-09 (S-03) |
| 4 | ¿Cuánto se le devuelve a la clienta? | **Lo que pagó** por esa prenda (con su descuento), nunca el precio de hoy. **El envío no se devuelve.** | ✅ Confirmada sin cambios | 26/11/2026 | Código | P-09 (S-04) |
| 5 | En un cambio, si la prenda nueva cuesta menos, ¿le damos la diferencia en vale o en dinero? | **En vale.** Si cuesta más, paga la diferencia con cualquier medio de pago. No se aplican descuentos a la prenda nueva. | ✅ Confirmada sin cambios | 26/11/2026 | Código | **P-16** (S-05) |
| 6 | Si la clienta pidió reembolso en dinero, ¿por qué medio se lo devolvemos? ¿Y quién lo autoriza? | Siempre lo autoriza Belén (la vendedora lo pide). Se sugiere el **mismo medio con que pagó**: efectivo → efectivo; tarjeta → anulación en la máquina; transferencia → transferencia. El efectivo sale de la caja abierta y se redondea a $10. Si se elige otro medio, el sistema avisa. | ✅ Confirmada sin cambios | 26/11/2026 | Código | **P-17**, P-09 (S-06) |
| 7 | Si la clienta pagó con un vale, ¿se le puede devolver en dinero? | **No:** un vale solo se devuelve en otro vale o en un cambio. | ✅ Confirmada sin cambios | 26/11/2026 | Código | P-09 (S-07) |
| 8 | ¿Cuánto dura un vale, hasta cuánto puede entregar una vendedora sin pedir permiso, y se puede usar de a poco? | Vence a los **90 días**. La vendedora puede entregar hasta **$50.000 por operación**; sobre eso lo aprueba Belén. Se puede usar de a poco y no tiene nombre (lo usa quien lo tenga). Un vale vencido no se reactiva. | ✅ Confirmada sin cambios | 26/11/2026 | Configuración `store_credit_validity_days` y `voucher_seller_cap` | P-09 (S-08) |
| 9 | ¿Qué motivos de devolución quiere ver en el reporte? | Talla · Falla · No es lo esperado · Me arrepentí · Otro (con una nota). | ✅ Confirmada sin cambios | 26/11/2026 | Código | P-09 (S-09) |
| 10 | ¿Quién registra las devoluciones de pedidos online que llegan por courier a la bodega? ¿Y quién paga el envío del cambio? | **Belén**, desde la bodega (sin cambios ni efectivo: la bodega no vende ni tiene caja). El envío de un cambio no se automatiza: se registra un pedido nuevo con su envío, que paga la clienta. | ✅ Confirmada sin cambios. Su aplicación a pedidos online ya entregados sigue abierta (fila 13, Q-01) | 26/11/2026 | Código | **P-22**, P-09 (S-10) |
| 11 | Si se anula una venta, ¿qué pasa con las devoluciones y los vales? | Una venta que ya tuvo una devolución, o que es la venta de un cambio, **no se puede anular** (para deshacer un cambio se devuelve la prenda nueva). Anular una venta pagada con vale le devuelve el saldo al vale, sin alargar su vencimiento. | ✅ Confirmada sin cambios | 26/11/2026 | Código | P-09 (S-11) |
| 12 | ¿Los vales también se usan en los pedidos online? | **Todavía no:** hoy solo se canjean en la caja de la tienda. | ✅ Confirmada sin cambios | 26/11/2026 | Código | P-09 (S-12) |
| 13 | **¿Se puede devolver o cambiar un pedido online que ya fue entregado, y cómo?** (¿en la tienda o por courier a la bodega? ¿quién paga el envío de vuelta? ¿el plazo corre desde la entrega?) | No se asumió nada nuevo: hoy rigen las respuestas 1, 2 y 10 de arriba. | 🟡 **Sin respuesta** | — | Código | **Q-01** |

## Lo que ya quedó decidido (no hace falta volver a preguntarlo)

- Solo Belén da descuentos, aprueba reembolsos y anula (RN-09, RN-15, RN-25). La vendedora pide la aprobación y Belén responde desde el celular o con su PIN.
- Cada aprobación sirve **una sola vez**, para esa devolución, esas prendas, ese destino y ese monto.
- El stock de la prenda devuelta entra a **la ubicación que la recibe** (RN-24).

## Qué queda pendiente

- **Fila 13 (Q-01):** falta saber si un pedido online ya entregado se puede devolver o cambiar, y cómo. Hasta entonces, a esos pedidos se les aplica lo descrito en las filas 1, 2 y 10 como supuesto 🟡.
- **Canje de vales en pedidos online:** Belén confirmó que hoy solo se canjean en la caja de la tienda (fila 12). El canje online queda para más adelante (RF-DEV-06).
- Las preguntas sobre **reportes** (P-24) y **envíos** (P-11) no son parte de esta lista y siguen abiertas.
