// Utilidades de los scripts de autenticación (auth:*). Sin dependencias: argumentos y prompt oculto con node.

/** Valor de `--nombre valor` o `--nombre=valor`, o undefined. */
export function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}`) return argv[i + 1];
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

export function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

export function requireArg(name: string, hint: string): string {
  const value = arg(name)?.trim();
  if (!value) {
    console.error(`Falta --${name}. ${hint}`);
    process.exit(1);
  }
  return value;
}

/** Lee una línea SIN mostrarla (contraseñas, PIN). Exige terminal interactiva. */
export function askHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error("No hay terminal interactiva para pedirla: define la variable de entorno en ESA misma terminal."));
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (fn: () => void) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(() => resolve(value));
        if (ch === "\u0003") return finish(() => reject(new Error("Cancelado.")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

/** Secreto de una variable de entorno (solo de esta terminal) o, si no está, de un prompt oculto con confirmación. */
export async function secretFrom(envName: string, label: string): Promise<{ value: string; fromEnv: boolean }> {
  const fromEnv = process.env[envName];
  if (fromEnv) return { value: fromEnv, fromEnv: true };
  const first = await askHidden(`${label}: `);
  const second = await askHidden(`Repite ${label.toLowerCase()}: `);
  if (first !== second) throw new Error("No coinciden.");
  return { value: first, fromEnv: false };
}

/** Los scripts de cuentas reales no corren contra una base demo: se borra al reiniciar y es pública. */
export function refuseDemoMode(): void {
  if (process.env.DEMO_MODE === "true") {
    console.error("DEMO_MODE=true: esta es una base de demostración (se reinicia y es pública). No se crean cuentas reales aquí.");
    console.error("Para probar en local, corre el script con DEMO_MODE vacío:  $env:DEMO_MODE=''; pnpm auth:...");
    process.exit(1);
  }
}

export function fail(error: unknown): never {
  // Solo el mensaje: nunca el valor de una contraseña ni de una variable de entorno.
  console.error(error instanceof Error ? error.message : "Error desconocido.");
  process.exit(1);
}
