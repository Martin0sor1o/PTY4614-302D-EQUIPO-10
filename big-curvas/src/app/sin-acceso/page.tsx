import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SinAccesoPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Sin acceso</CardTitle>
          <CardDescription>Tu rol no tiene permiso para ver esta pantalla.</CardDescription>
        </CardHeader>
        <div className="px-4 pb-4">
          <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Volver al inicio
          </Link>
        </div>
      </Card>
    </main>
  );
}
