import { UserButton } from "@clerk/nextjs";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-neutral-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">
            Ayuno & Metabolismo
          </p>
          <h1 className="text-sm font-semibold text-white">Tu progreso metabólico</h1>
        </div>

        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-10 w-10",
            },
          }}
        />
      </div>
    </header>
  );
}