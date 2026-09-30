"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { demoLogin } from "@/modules/auth";

const schema = z.object({ userId: z.string().min(1) });

// DEMO: "Entrar como…" sin contraseña. Solo funciona con DEMO_MODE=true (se valida en demoLogin).
export async function demoLoginAction(formData: FormData): Promise<void> {
  const { userId } = schema.parse({ userId: formData.get("userId") });
  await demoLogin(userId);
  redirect("/");
}
