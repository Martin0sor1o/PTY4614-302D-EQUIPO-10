# Big Curvas – Documentación del proyecto (índice)

> Estado: **v0.4 – Validado con la clienta (1 tienda + bodega)** · Fecha: 2026-10-02
> Estos documentos son la "fuente de verdad" para el diseño y para la IA que programa.
> Cualquier cambio de regla de negocio se registra primero aquí (en `07_DECISIONES_Y_PREGUNTAS.md`).

## Documentos

| # | Archivo | Para qué sirve | Quién lo usa |
|---|---------|----------------|--------------|
| 00 | `00_README.md` | Índice y convenciones | Todos |
| 01 | `01_VISION_Y_ALCANCE.md` | Problema, objetivos, alcance MVP, fuera de alcance, supuestos | Negocio + dev |
| 02 | `02_REQUERIMIENTOS.md` | Requerimientos funcionales (RF), no funcionales (RNF), reglas de negocio (RN), roles | Dev + IA |
| 03 | `03_ARQUITECTURA.md` | Stack, módulos, flujos críticos, seguridad, despliegue | Dev + IA |
| 04 | `04_MODELO_DE_DATOS.md` | Entidades, campos, relaciones, invariantes | Dev + IA |
| 05 | `05_PLAN_DE_TRABAJO.md` | Fases, hitos, entregables, criterios de aceptación, riesgos | Dev + negocio |
| 06 | `06_DESARROLLO_CON_IA.md` | Herramientas, flujo de trabajo con Claude Code, plantillas de prompt | Dev |
| 07 | `07_DECISIONES_Y_PREGUNTAS.md` | Registro de decisiones (ADR) y preguntas abiertas | Todos |
| — | `CLAUDE.md` | Reglas para Claude Code; va en la **raíz del repositorio** | IA |

## Convenciones de IDs

- `RF-XXX-nn` requerimiento funcional (XXX = módulo: CAT, INV, POS, PED, DEV, CLI, PRV, REP, USR, AUT, SII).
- `RNF-nn` requerimiento no funcional.
- `RN-nn` regla de negocio (las críticas también están en `CLAUDE.md`).
- `ADR-nnn` decisión de arquitectura.
- `P-nn` pregunta abierta (bloquea o condiciona algo).

## Cómo usar estos documentos

1. **Proyecto de Claude (arquitectura):** subir todos los archivos como conocimiento del proyecto.
2. **Repositorio de código:** copiar `CLAUDE.md` en la raíz y el resto en `/docs`.
3. Antes de cada feature: revisar RF/RN involucrados → escribir spec corta → prompt a Claude Code (ver doc 06).
4. Al cerrar una pregunta abierta (P-nn): actualizar el documento afectado y registrar ADR si corresponde.

## Glosario

| Término | Significado |
|---------|-------------|
| Producto / modelo | Prenda genérica (ej. "Jeans Mom Tiro Alto") |
| Variante | Combinación producto + talla + color. **Es la unidad de stock** y tiene SKU y código de barras propios |
| Ubicación | Lugar físico donde hay stock: Tienda Rancagua y Bodega (casa de Belén). El stock siempre se lleva por variante **y** ubicación |
| On hand (físico) | Unidades físicamente presentes en una ubicación |
| Reservado | Unidades apartadas para pedidos online **ya pagados** y aún no preparados (en bodega, o en la tienda si se llevarán a bodega) |
| Disponible | `físico − reservado`. Es lo único que se puede vender |
| Movimiento | Registro inmutable de cada cambio de stock (ledger) |
| Pedido online | Venta tomada por Instagram (la registra Belén); se aparta al pagar y se despacha desde la bodega |
| Traspaso / traslado | Movimiento de prendas entre tienda y bodega (hoy Belén, los viernes): se envía (queda en tránsito) y se recibe escaneando |
| En tránsito | Prendas enviadas en un traspaso y aún no recibidas |
| Aprobación remota | Autorización que Belén da desde su celular o con su PIN (cualquier descuento de vendedora, reembolso, anulación) |
| Caja / turno | Sesión de caja del POS con apertura, cierre y cuadratura |
| Vale | Saldo a favor del cliente (por cambio/devolución) |
| CLP | Pesos chilenos, siempre enteros |
