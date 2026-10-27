import { pingDatabase } from "@/modules/system";

export const dynamic = "force-dynamic";

// Health check del hosting (Render). Público y sin datos: solo dice si la app y la BD responden.
export async function GET(): Promise<Response> {
  const database = await pingDatabase();
  return Response.json({ status: database ? "ok" : "error", database: database ? "up" : "down" }, { status: database ? 200 : 503 });
}
