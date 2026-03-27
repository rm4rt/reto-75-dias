"use client";

import AiAssistant from "@/components/ai-assistant";

export default function AiPage() {
  return (
    <section
      className="relative flex flex-col gap-5"
      style={{
        background:
          "radial-gradient(ellipse at 75% -5%, rgba(139,92,246,0.22) 0%, transparent 55%)," +
          "radial-gradient(ellipse at 5% 90%, rgba(59,130,246,0.15) 0%, transparent 50%)",
      }}
    >
      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-3xl px-6 py-10"
        style={{
          background:
            "radial-gradient(ellipse at 70% 0%, rgba(139,92,246,0.35) 0%, transparent 60%)," +
            "radial-gradient(ellipse at 10% 100%, rgba(59,130,246,0.25) 0%, transparent 55%)," +
            "linear-gradient(160deg, #0f0f13 0%, #111118 100%)",
        }}
      >
        {/* Decorative glow ring */}
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, rgba(167,139,250,1) 0%, transparent 70%)" }}
        />

        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-violet-400/70">
          Asistente IA
        </p>
        <h1
          className="mt-3 text-3xl font-black uppercase leading-tight tracking-tight text-white"
          style={{ textShadow: "0 0 40px rgba(139,92,246,0.5)" }}
        >
          Tu coach de<br />ayuno intermitente
        </h1>
        <p className="mt-3 text-sm text-white/50">
          Respuestas rápidas sobre ayuno y alimentación.
        </p>
      </div>

      {/* ── Assistant ── */}
      <AiAssistant />

    </section>
  );
}
