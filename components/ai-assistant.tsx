"use client";

import { useState } from "react";

const QUICK = [
  "Qué comer al romper el ayuno",
  "Dame una receta saludable",
  "Tengo hambre, qué hago",
];

export default function AiAssistant({ preset }: { preset?: number }) {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer(null);
    setError(null);

    const res = await fetch("/api/ai-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, preset }),
    }).catch((err) => {
      console.error("[ai-assistant] fetch error:", err);
      return null;
    });

    if (!res || !res.ok) {
      console.error("[ai-assistant] response error — status:", res?.status);
      const msg = res?.status === 429
        ? "El asistente IA está temporalmente saturado. Inténtalo de nuevo en unos momentos."
        : "Ups, algo salió mal. Por favor, inténtalo más tarde.";
      setError(msg);
      setLoading(false);
      return;
    }

    const data = await res.json().catch(() => null);
    if (data?.answer) {
      setAnswer(data.answer);
    } else {
      setError("Ups, algo salió mal. Por favor, inténtalo más tarde.");
    }
    setLoading(false);
  };

  const handleSubmit = () => {
    ask(input);
    setInput("");
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">

      {/* Quick buttons */}
      <div className="flex flex-col gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            disabled={loading}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-left text-sm text-white/70 transition hover:bg-white/[0.08] hover:text-white/90 disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Text input */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Escribe tu pregunta..."
          disabled={loading}
          className="flex-1 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:bg-white/15 disabled:opacity-40"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !input.trim()}
          className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:opacity-40"
        >
          Preguntar
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <p className="mt-4 text-xs text-white/40">Pensando…</p>
      )}

      {/* Error */}
      {error && (
        <p className="mt-4 text-xs text-red-400">{error}</p>
      )}

      {/* Answer */}
      {answer && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{answer}</p>
        </div>
      )}
    </div>
  );
}
