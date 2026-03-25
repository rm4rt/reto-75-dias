"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import supabase from "@/lib/supabaseClient";

const PRESETS = [
  { hours: 16, label: "Ayuno estándar" },
  { hours: 24, label: "Un día completo" },
  { hours: 36, label: "Ayuno extendido" },
  { hours: 48, label: "Ayuno largo" },
  { hours: 72, label: "Ayuno avanzado" },
];

const KCAL_PER_HOUR = 75; // ~1800 kcal/day avg BMR
const KCAL_PER_KG = 7700;

type Session = {
  id: string;
  start_time: string;
  end_time: string | null;
  target_hours: number;
  duration_hours: number | null;
};

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FastingPage() {
  const { user } = useUser();
  const [preset, setPreset] = useState(16);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      const { data: active } = await supabase
        .from("fasting_sessions")
        .select("*")
        .eq("clerk_user_id", user.id)
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveSession(active ?? null);
      if (active) setPreset(active.target_hours);

      const { data: hist } = await supabase
        .from("fasting_sessions")
        .select("*")
        .eq("clerk_user_id", user.id)
        .not("end_time", "is", null)
        .order("start_time", { ascending: false })
        .limit(10);

      setHistory(hist ?? []);
    };
    load();
  }, [user?.id]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!activeSession) { setElapsed(0); return; }

    const tick = () => {
      setElapsed(Math.floor((Date.now() - new Date(activeSession.start_time).getTime()) / 1000));
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeSession]);

  const handleStart = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("fasting_sessions")
      .insert({ clerk_user_id: user.id, start_time: new Date().toISOString(), target_hours: preset })
      .select()
      .single();
    if (!error && data) setActiveSession(data);
    setLoading(false);
  };

  const handleEnd = async () => {
    if (!user?.id || !activeSession) return;
    setLoading(true);
    const end = new Date();
    const durationHours =
      Math.round(((end.getTime() - new Date(activeSession.start_time).getTime()) / 3_600_000) * 100) / 100;
    const { error } = await supabase
      .from("fasting_sessions")
      .update({ end_time: end.toISOString(), duration_hours: durationHours })
      .eq("id", activeSession.id);
    if (!error) {
      setHistory((prev) => [{ ...activeSession, end_time: end.toISOString(), duration_hours: durationHours }, ...prev]);
      setActiveSession(null);
    }
    setLoading(false);
  };

  const elapsedHours = elapsed / 3600;
  const progress = activeSession
    ? Math.min((elapsed / (activeSession.target_hours * 3600)) * 100, 100)
    : 0;
  const isGoalMet = activeSession ? elapsedHours >= activeSession.target_hours : false;

  const presetKcal = Math.round(preset * KCAL_PER_HOUR);
  const presetKg = (presetKcal / KCAL_PER_KG).toFixed(3);

  const totalHours = history.reduce((acc, s) => acc + (s.duration_hours ?? 0), 0);
  const totalKcal = Math.round(totalHours * KCAL_PER_HOUR);
  const totalKg = (totalKcal / KCAL_PER_KG).toFixed(2);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ayuno Intermitente</h1>
        <p className="mt-1 text-sm text-white/60">
          Controla tus ayunos y estima tu progreso
        </p>
      </div>

      {/* Preset selector — only shown when no active session */}
      {!activeSession && (
        <>
          <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
            {PRESETS.map((p) => {
              const selected = preset === p.hours;
              return (
                <button
                  key={p.hours}
                  onClick={() => setPreset(p.hours)}
                  className={[
                    "flex min-w-[84px] shrink-0 flex-col items-center rounded-2xl border px-3 py-4 transition",
                    selected
                      ? "border-white bg-white text-black"
                      : "border-white/10 bg-white/5 text-white hover:border-white/30",
                  ].join(" ")}
                >
                  <span className="text-xl font-bold">{p.hours}h</span>
                  <span className={`mt-1 text-xs ${selected ? "text-black/60" : "text-white/50"}`}>
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Estimation */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">
              Estimación — {preset}h
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs text-white/50">Kcal estimadas</p>
                <p className="mt-1 text-xl font-bold">{presetKcal} kcal</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs text-white/50">Equiv. grasa</p>
                <p className="mt-1 text-xl font-bold">{presetKg} kg</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-white/30">
              Estimaciones basadas en metabolismo basal promedio. Los resultados reales varían.
            </p>
          </div>
        </>
      )}

      {/* Timer / CTA */}
      <div
        className={[
          "rounded-3xl border p-6 transition-colors",
          isGoalMet
            ? "border-green-500/30 bg-green-500/5"
            : activeSession
            ? "border-white/20 bg-white/5"
            : "border-white/10 bg-white/5",
        ].join(" ")}
      >
        {activeSession ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Ayuno activo · Meta {activeSession.target_hours}h
              </p>
              {isGoalMet && (
                <span className="shrink-0 rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-semibold text-green-400">
                  ¡Meta cumplida!
                </span>
              )}
            </div>

            <p className="mt-5 font-mono text-6xl font-bold tabular-nums tracking-tight">
              {formatTimer(elapsed)}
            </p>

            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${isGoalMet ? "bg-green-400" : "bg-white"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-white/40">
              <span>0h</span>
              <span>
                {elapsedHours.toFixed(1)}h / {activeSession.target_hours}h
              </span>
            </div>

            <button
              onClick={handleEnd}
              disabled={loading}
              className="mt-5 w-full rounded-2xl bg-white/10 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {loading ? "Terminando…" : "Terminar Ayuno"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Sin ayuno activo</p>
            <p className="mt-2 text-base font-semibold text-white/90">
              Listo para el ayuno de {preset}h
            </p>
            <button
              onClick={handleStart}
              disabled={loading}
              className="mt-4 w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-semibold text-black transition hover:scale-[1.01] disabled:opacity-50"
            >
              {loading ? "Iniciando…" : `Iniciar Ayuno de ${preset}h`}
            </button>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Resumen total</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Horas</p>
            <p className="mt-1 text-xl font-bold">{totalHours.toFixed(1)}h</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Kcal</p>
            <p className="mt-1 text-xl font-bold">{totalKcal}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Equiv.</p>
            <p className="mt-1 text-xl font-bold">{totalKg} kg</p>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Historial</p>
        {history.length === 0 ? (
          <p className="mt-4 text-xs text-white/40">Aún no hay ayunos completados.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {history.map((s) => {
              const kcal = Math.round((s.duration_hours ?? 0) * KCAL_PER_HOUR);
              const date = new Date(s.start_time).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-white/90">
                      {s.duration_hours?.toFixed(1)}h completadas
                    </p>
                    <p className="text-xs text-white/50">{date}</p>
                  </div>
                  <p className="text-sm text-white/60">{kcal} kcal</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
