import { beforeEach, describe, expect, it } from "vitest";
import { APPROVER_PIN_MAX, APPROVER_PIN_MIN, cleanApproverPin } from "@/components/approvals/pin-input";
import { db } from "@/lib/db";
import { approveWithPin } from "@/modules/approvals";
import { expectAppError, newKey, resetDemo, type Fixtures } from "./helpers";
import { openCaja, PBA_XL, PIN, requestDiscount } from "./approvals-helpers";

// El campo del PIN de la caja contra la validación REAL del servidor (aquí no se cambia ninguna regla): lo que el campo
// deja escribir es lo que el servidor llega a comparar.

let f: Fixtures;
let requestId: string;
beforeEach(async () => {
  f = await resetDemo();
  await openCaja(f);
  requestId = (await requestDiscount(f, [{ sku: PBA_XL, qty: 2, discountBps: 1000 }])).result.id;
});

const send = (pin: string) =>
  approveWithPin({ actor: f.actors.vendRga, requestId, approverId: f.actors.belen.id, pin, idempotencyKey: newKey("pin") });
const attempts = async () => (await db.user.findUniqueOrThrow({ where: { id: f.actors.belen.id } })).failedPinAttempts;

describe("campo del PIN de la administradora", () => {
  it("deja solo dígitos: letras, espacios y signos no llegan al servidor", () => {
    expect(cleanApproverPin("12 3a4-5D6")).toBe("123456");
    expect(cleanApproverPin("abcD ")).toBe("");
    expect(cleanApproverPin("9".repeat(30))).toHaveLength(APPROVER_PIN_MAX);
  });

  it("no recorta un PIN válido escrito o pegado con espacios", async () => {
    const typed = ` ${PIN.slice(0, 3)} ${PIN.slice(3)} `;
    expect(cleanApproverPin(typed)).toBe(PIN);
    const { result } = await send(cleanApproverPin(typed));
    expect(result.status).toBe("APROBADA");
  });

  it("su mínimo y su máximo son los del servidor: dentro de ellos el PIN se compara", async () => {
    for (const length of [APPROVER_PIN_MIN, APPROVER_PIN_MAX]) {
      await expectAppError(send("0".repeat(length)), "VALIDATION", /PIN incorrecto/);
    }
    expect(await attempts()).toBe(2);
  });

  it("fuera de ellos el servidor ni lo compara (no gasta un intento)", async () => {
    for (const length of [APPROVER_PIN_MIN - 1, APPROVER_PIN_MAX + 1]) {
      await expect(send("0".repeat(length))).rejects.toMatchObject({ code: "VALIDATION" });
    }
    expect(await attempts()).toBe(0);
  });
});
