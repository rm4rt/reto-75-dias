import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-950 px-6 text-white">
      <h1 className="text-center text-4xl font-bold">Ayuno & Metabolismo</h1>
      <p className="max-w-sm text-center text-white/60">
        Controla tu ayuno intermitente, registra tu peso y mide tu progreso metabólico real.
      </p>

      {userId ? (
        <Link
          href="/fasting"
          className="rounded-2xl bg-white px-6 py-3 font-semibold text-black"
        >
          Entrar
        </Link>
      ) : (
        <Link
          href="/sign-in"
          className="rounded-2xl bg-white px-6 py-3 font-semibold text-black"
        >
          Entrar
        </Link>
      )}
    </main>
  );
}