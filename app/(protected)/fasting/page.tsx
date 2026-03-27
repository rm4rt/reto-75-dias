"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import supabase from "@/lib/supabaseClient";
import { useAppStore } from "@/app/store/useAppStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESETS = [
  { hours: 8,  label: "Básico" },
  { hours: 12, label: "Intermedio" },
  { hours: 16, label: "Estándar" },
  { hours: 18, label: "Avanzado" },
  { hours: 24, label: "Un día" },
  { hours: 36, label: "Extendido" },
  { hours: 48, label: "Profundo" },
];

const TIMELINE = [
  { hours: 0,  msg: "Tu cuerpo usa glucosa como combustible" },
  { hours: 4,  msg: "La insulina comienza a bajar" },
  { hours: 8,  msg: "Empiezas a usar grasa como energía" },
  { hours: 12, msg: "Modo quema de grasa activado" },
  { hours: 16, msg: "Cetosis ligera iniciada" },
  { hours: 18, msg: "Quemando grasa activamente" },
  { hours: 24, msg: "Autofagia iniciada — limpieza celular" },
  { hours: 36, msg: "Procesos celulares profundos activos" },
  { hours: 48, msg: "Estado metabólico avanzado" },
];

const TIPS = [
  "La autofagia ayuda a limpiar células dañadas y envejecidas.",
  "El ayuno mejora la sensibilidad a la insulina.",
  "El cuerpo cambia a quema de grasa tras varias horas en ayuno.",
  "Ayunar reduce los niveles de inflamación sistémica.",
  "El ayuno puede mejorar la claridad mental y el foco.",
  "La hormona de crecimiento aumenta durante el ayuno.",
];

const LEVELS = [
  { level: 1, fasts: 1,  label: "Iniciado",     emoji: "🌱" },
  { level: 2, fasts: 3,  label: "Constante",    emoji: "🔥" },
  { level: 3, fasts: 7,  label: "Disciplinado", emoji: "⚡" },
  { level: 4, fasts: 15, label: "Avanzado",     emoji: "🧠" },
  { level: 5, fasts: 30, label: "Maestro",      emoji: "🏆" },
];

const FEEDING_GUIDANCE = [
  "Empieza hidratándote.",
  "Rompe el ayuno con proteína, fibra y grasas saludables.",
  "Evita una comida muy pesada o ultraprocesada de golpe.",
  "Si tienes diabetes o tomas medicación, consúltalo con tu profesional de salud.",
];

const KCAL_PER_HOUR = 75;
const KCAL_PER_KG   = 7700;
const RING_SIZE     = 232;
const RING_RADIUS   = 96;
const RING_STROKE   = 7;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ─── Types ────────────────────────────────────────────────────────────────────

type Session = {
  id: string;
  start_time: string;
  end_time: string | null;
  target_hours: number;
  duration_hours: number | null;
  feeding_window_hours?: number | null;
  feeding_window_start?: string | null;
  feeding_window_end?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Supabase returns timestamptz without a trailing 'Z' in some configurations
 * (e.g. "2026-03-27T10:00:00+00:00" or "2026-03-27 10:00:00").
 * A bare ISO string with no timezone is parsed by JS as LOCAL time, causing
 * a UTC-offset error on the elapsed calculation.
 * This helper normalises any Supabase timestamp to a UTC millisecond value.
 */
function parseTS(ts: string): number {
  const s = ts.replace(" ", "T");
  const hasZone = s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasZone ? s : s + "Z").getTime();
}

function getBioMessage(elapsedHours: number): string {
  const entry = [...TIMELINE].reverse().find((t) => elapsedHours >= t.hours);
  return entry?.msg ?? TIMELINE[0].msg;
}

function calcFastingStreak(history: Session[]): number {
  const days = [
    ...new Set(
      history
        .filter((s) => s.end_time)
        .map((s) => new Date(s.end_time!).toDateString())
    ),
  ].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (days.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round(
      (new Date(days[i - 1]).getTime() - new Date(days[i]).getTime()) / 86_400_000
    );
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FastingPage() {
  const { user } = useUser();
  const {
    feedingWindowStart,
    feedingWindowEnd,
    feedingWindowHours,
    setFeedingWindow,
    clearFeedingWindow,
    startWeight,
    weight,
  } = useAppStore();

  // ── Fasting state ──────────────────────────────────────────────────────────
  const [preset, setPreset]               = useState(16);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [history, setHistory]             = useState<Session[]>([]);
  const [elapsed, setElapsed]             = useState(0);
  const [loading, setLoading]             = useState(false);
  const [tipIndex, setTipIndex]           = useState(0);

  // ── Feeding window state ───────────────────────────────────────────────────
  const [pendingFeedingSession, setPendingFeedingSession] = useState<Session | null>(null);
  const [feedingInput, setFeedingInput]                   = useState(4);
  const [feedingElapsed, setFeedingElapsed]               = useState(0);
  const [feedingEndedMsg, setFeedingEndedMsg]             = useState(false);
  const [showFullHistory, setShowFullHistory]             = useState(false);

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
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
        .limit(20);

      setHistory(hist ?? []);
    };
    load();
  }, [user?.id]);

  // ── Fasting timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!activeSession) { setElapsed(0); return; }

    const startMs = parseTS(activeSession.start_time);
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeSession]);

  // ── Feeding window timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (feedingTimerRef.current) clearInterval(feedingTimerRef.current);
    if (!feedingWindowStart) { setFeedingElapsed(0); return; }

    const startMs = parseTS(feedingWindowStart);
    const tick = () => setFeedingElapsed(Math.floor((Date.now() - startMs) / 1000));
    tick();
    feedingTimerRef.current = setInterval(tick, 1000);
    return () => { if (feedingTimerRef.current) clearInterval(feedingTimerRef.current); };
  }, [feedingWindowStart]);

  // ── Auto-close feeding window when timer reaches zero ─────────────────────
  useEffect(() => {
    if (feedingWindowHours === null || feedingElapsed === 0) return;
    const targetSec = feedingWindowHours * 3600;
    if (feedingElapsed < targetSec) return;
    clearFeedingWindow();
    setFeedingEndedMsg(true);
    const t = setTimeout(() => setFeedingEndedMsg(false), 3000);
    return () => clearTimeout(t);
  }, [feedingElapsed, feedingWindowHours]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rotating tips (only while fasting) ────────────────────────────────────
  useEffect(() => {
    if (tipRef.current) clearInterval(tipRef.current);
    if (!activeSession) return;
    tipRef.current = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 9000);
    return () => { if (tipRef.current) clearInterval(tipRef.current); };
  }, [activeSession]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!user?.id || feedingWindowEnd !== null) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("fasting_sessions")
      .insert({
        clerk_user_id: user.id,
        start_time: new Date().toISOString(),
        target_hours: preset,
      })
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
      Math.round(
        ((end.getTime() - new Date(activeSession.start_time).getTime()) / 3_600_000) * 100
      ) / 100;
    const { error } = await supabase
      .from("fasting_sessions")
      .update({ end_time: end.toISOString(), duration_hours: durationHours })
      .eq("id", activeSession.id);
    if (!error) {
      const ended: Session = {
        ...activeSession,
        end_time: end.toISOString(),
        duration_hours: durationHours,
      };
      setHistory((prev) => [ended, ...prev]);
      setActiveSession(null);
      setPendingFeedingSession(ended);
    }
    setLoading(false);
  };

  const handleStartFeedingWindow = () => {
    if (!pendingFeedingSession) return;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + feedingInput * 3_600_000);
    setFeedingWindow(now.toISOString(), windowEnd.toISOString(), feedingInput);
    setPendingFeedingSession(null);
  };

  const handleSkipFeedingWindow = () => setPendingFeedingSession(null);

  const handleEndFeedingWindow = () => {
    clearFeedingWindow();
    setFeedingEndedMsg(true);
    setTimeout(() => setFeedingEndedMsg(false), 3000);
  };

  // ── Derived — fasting ─────────────────────────────────────────────────────
  const elapsedHours   = elapsed / 3600;
  const targetHours    = activeSession?.target_hours ?? preset;
  const progress       = activeSession ? Math.min((elapsed / (targetHours * 3600)) * 100, 100) : 0;
  const isGoalMet      = activeSession ? elapsedHours >= targetHours : false;
  const remainingHours = activeSession ? Math.max(targetHours - elapsedHours, 0) : 0;
  const bioMessage     = getBioMessage(elapsedHours);
  const strokeOffset   = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;
  const ringColor      = isGoalMet ? "#4ade80" : "white";

  const fastCount  = history.length;
  const maxHours   = history.reduce((m, s) => Math.max(m, s.duration_hours ?? 0), 0);
  const streak     = calcFastingStreak(history);
  const curLevel   = LEVELS.filter((l) => fastCount >= l.fasts).at(-1) ?? null;
  const nextLevel  = LEVELS.find((l) => fastCount < l.fasts);

  const totalHours = history.reduce((a, s) => a + (s.duration_hours ?? 0), 0);
  const totalKcal  = Math.round(totalHours * KCAL_PER_HOUR);
  const totalKgEq  = (totalKcal / KCAL_PER_KG).toFixed(2);
  const presetKcal = Math.round(preset * KCAL_PER_HOUR);
  const presetKgEq = (presetKcal / KCAL_PER_KG).toFixed(3);

  const achievements = [
    { label: "Primer ayuno",    emoji: "🌟", unlocked: fastCount >= 1 },
    { label: "16h completadas", emoji: "⏱",  unlocked: maxHours >= 16 },
    { label: "24h completadas", emoji: "🔥", unlocked: maxHours >= 24 },
    { label: "3 días seguidos", emoji: "⚡", unlocked: streak >= 3 },
    { label: "7 días seguidos", emoji: "🏆", unlocked: streak >= 7 },
  ];

  // ── Derived — feeding window ───────────────────────────────────────────────
  const isFeedingActive  = feedingWindowEnd !== null && parseTS(feedingWindowEnd) > Date.now();
  const feedingTargetSec = (feedingWindowHours ?? 0) * 3600;
  const feedingRemaining = Math.max(feedingTargetSec - feedingElapsed, 0);
  const isFeedingDone    = feedingWindowHours !== null && feedingElapsed > 0 && feedingRemaining === 0;
  const feedingProgress  = feedingTargetSec > 0
    ? Math.min((feedingElapsed / feedingTargetSec) * 100, 100)
    : 0;

  // Hide presets and estimations while feeding or fasting states are active
  const showPresets = !activeSession && !pendingFeedingSession && feedingWindowHours === null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="flex flex-col gap-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ayuno Intermitente</h1>
        <p className="mt-1 text-sm text-white/60">
          Controla tus ayunos y estima tu progreso
        </p>
      </div>

      {/* ── Preset selector + estimation (idle only) ── */}
      {showPresets && (
        <>
          <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
            {PRESETS.map((p) => {
              const selected = preset === p.hours;
              return (
                <button
                  key={p.hours}
                  onClick={() => setPreset(p.hours)}
                  className={[
                    "flex min-w-[76px] shrink-0 flex-col items-center rounded-2xl border px-3 py-3.5 transition",
                    selected
                      ? "border-white bg-white text-black"
                      : "border-white/10 bg-white/5 text-white hover:border-white/25",
                  ].join(" ")}
                >
                  <span className="text-lg font-bold">{p.hours}h</span>
                  <span className={`mt-0.5 text-[10px] ${selected ? "text-black/55" : "text-white/45"}`}>
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-white/35">
              Estimación · {preset}h
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs text-white/45">Kcal estimadas</p>
                <p className="mt-1 text-2xl font-bold">{presetKcal}</p>
                <p className="text-xs text-white/40">kcal</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs text-white/45">Equiv. grasa</p>
                <p className="mt-1 text-2xl font-bold">{presetKgEq}</p>
                <p className="text-xs text-white/40">kg</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-white/25">
              Estimaciones basadas en metabolismo basal promedio. Los resultados reales varían.
            </p>
          </div>
        </>
      )}

      {/* ── Central block — mutually exclusive states ── */}
      {pendingFeedingSession ? (

        /* ─ Feeding window prompt ─ */
        <div className="rounded-3xl border border-green-500/30 bg-green-500/5 p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-green-400/70">
            Ayuno completado
          </p>
          <p className="mt-2 text-base font-semibold text-white/90">
            ¿Cuántas horas quieres para tu ventana de alimentación?
          </p>
          <p className="mt-1 text-xs text-white/45">Rango: 1–24 horas</p>

          <div className="mt-5 flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={24}
              value={feedingInput}
              onChange={(e) =>
                setFeedingInput(Math.min(24, Math.max(1, Number(e.target.value))))
              }
              className="w-20 rounded-2xl bg-white/10 px-4 py-3 text-center text-lg font-bold text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
            <span className="text-sm text-white/60">horas</span>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleStartFeedingWindow}
              className="flex-1 rounded-2xl bg-green-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-400"
            >
              Iniciar ventana
            </button>
            <button
              onClick={handleSkipFeedingWindow}
              className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/60 transition hover:bg-white/20"
            >
              Ahora no
            </button>
          </div>
        </div>

      ) : feedingWindowHours !== null ? (

        /* ─ Feeding countdown ─ */
        <div
          className={[
            "rounded-3xl border p-6 transition-colors duration-700",
            isFeedingDone
              ? "border-white/10 bg-white/[0.03]"
              : "border-green-500/25 bg-green-500/[0.06]",
          ].join(" ")}
        >
          <p className={`text-center text-xs font-medium uppercase tracking-[0.18em] ${isFeedingDone ? "text-white/35" : "text-green-400/70"}`}>
            Ventana de alimentación
          </p>

          <div className="mt-5 flex flex-col items-center gap-2">
            <p className={`font-mono text-5xl font-bold tabular-nums tracking-tight ${isFeedingDone ? "text-white/40" : "text-green-400"}`}>
              {formatTimer(isFeedingDone ? 0 : feedingRemaining)}
            </p>
            <p className="text-xs text-white/40">
              {isFeedingDone
                ? "Ventana terminada"
                : `de ${feedingWindowHours}h · ${Math.round(feedingProgress)}% transcurrido`}
            </p>
          </div>

          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-1000"
              style={{ width: `${feedingProgress}%` }}
            />
          </div>

          {!isFeedingDone && (
            <button
              onClick={handleEndFeedingWindow}
              className="mt-5 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/60 transition hover:bg-white/20"
            >
              Finalizar ventana
            </button>
          )}
        </div>

      ) : activeSession ? (

        /* ─ Fasting timer ─ */
        <div
          className={[
            "rounded-3xl border p-6 transition-colors duration-700",
            isGoalMet
              ? "border-green-500/25 bg-green-500/5"
              : "border-white/15 bg-white/[0.04]",
          ].join(" ")}
        >
          <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-white/40">
            {bioMessage}
          </p>
          <p className="mt-1 text-center text-[10px] text-white/20">
            Orientativo — los tiempos varían según cada persona
          </p>

          <div
            className="relative mx-auto mt-5 flex items-center justify-center"
            style={{ width: RING_SIZE, height: RING_SIZE }}
          >
            <svg
              width={RING_SIZE}
              height={RING_SIZE}
              className="-rotate-90"
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={RING_STROKE}
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke={ringColor}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeOffset}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.7s" }}
              />
            </svg>

            <div className="relative flex flex-col items-center">
              <span className="font-mono text-5xl font-bold tabular-nums tracking-tight">
                {formatTimer(elapsed)}
              </span>
              <span className="mt-1.5 text-xs text-white/40">
                Meta: {activeSession.target_hours}h
              </span>
              {isGoalMet ? (
                <span className="mt-2 rounded-full bg-green-500/20 px-3 py-0.5 text-xs font-semibold text-green-400">
                  ¡Meta cumplida!
                </span>
              ) : (
                <span className="mt-2 text-xs text-white/35">
                  {Math.round(progress)}% · faltan {remainingHours.toFixed(1)}h
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleEnd}
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-white/10 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-white/18 disabled:opacity-50"
          >
            {loading ? "Terminando…" : "Terminar Ayuno"}
          </button>
        </div>

      ) : (

        /* ─ Idle — start block ─ */
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          {feedingEndedMsg && (
            <p className="mb-4 text-xs font-medium text-green-400">Ventana finalizada</p>
          )}
          <p className="text-xs uppercase tracking-[0.18em] text-white/35">Sin ayuno activo</p>
          <p className="mt-2 text-lg font-semibold text-white/90">
            Ayuno de {preset}h listo para iniciar
          </p>
          <p className="mt-1 text-sm text-white/45">{TIMELINE[0].msg}</p>
          {feedingWindowEnd !== null ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/50">
              No puedes iniciar un ayuno mientras tu ventana de alimentación siga activa.
            </p>
          ) : (
            <button
              onClick={handleStart}
              disabled={loading}
              className="mt-5 w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-semibold text-black transition hover:scale-[1.01] disabled:opacity-50"
            >
              {loading ? "Iniciando…" : `Iniciar Ayuno de ${preset}h`}
            </button>
          )}
        </div>
      )}

      {/* ── Breaking the fast guidance (shown whenever feeding window is active) ── */}
      {feedingWindowHours !== null && (
        <div className="rounded-3xl border border-green-500/15 bg-white/[0.03] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-green-400/60">
            Cómo romper el ayuno
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {FEEDING_GUIDANCE.map((tip) => (
              <p key={tip} className="text-sm leading-snug text-white/65">
                {tip}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Micro tip (only while fasting) ── */}
      {activeSession && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Sabías que</p>
          <p className="mt-1.5 text-sm text-white/65">{TIPS[tipIndex]}</p>
        </div>
      )}

      {/* ── Level + Streak ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Nivel</p>
          {curLevel ? (
            <>
              <p className="mt-1.5 text-2xl">{curLevel.emoji}</p>
              <p className="mt-1 text-sm font-semibold text-white/90">{curLevel.label}</p>
              {nextLevel && (
                <>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-white/60 transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          ((fastCount - (LEVELS[curLevel.level - 1]?.fasts ?? 0)) /
                            (nextLevel.fasts - (LEVELS[curLevel.level - 1]?.fasts ?? 0))) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-white/30">
                    {fastCount}/{nextLevel.fasts} para nivel {nextLevel.level}
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-white/40">Completa tu primer ayuno</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Racha</p>
          <p className="mt-1.5 text-2xl">🔥</p>
          <p className="mt-1 text-2xl font-bold">{streak}</p>
          <p className="text-xs text-white/40">{streak === 1 ? "día seguido" : "días seguidos"}</p>
        </div>
      </div>

      {/* ── Achievements ── */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Logros</p>
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
          {achievements.map((a) => (
            <div
              key={a.label}
              className={[
                "flex min-w-[84px] shrink-0 flex-col items-center rounded-2xl border px-3 py-3 transition",
                a.unlocked
                  ? "border-white/20 bg-white/10"
                  : "border-white/5 bg-white/[0.02] opacity-35",
              ].join(" ")}
            >
              <span className="text-xl">{a.emoji}</span>
              <span className="mt-1.5 text-center text-[10px] leading-tight text-white/70">
                {a.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Progreso físico ── */}
      {(() => {
        const kgChange = +(startWeight - weight).toFixed(1);
        const label =
          kgChange > 0
            ? `Has perdido ${kgChange} kg`
            : kgChange < 0
            ? `Has ganado ${Math.abs(kgChange)} kg`
            : "Aún sin cambios";
        return (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Progreso físico</p>
            <p className="mt-3 text-2xl font-bold text-white/90">{label}</p>
            <p className="mt-1 text-xs text-white/40">Desde tu punto de partida</p>
          </div>
        );
      })()}

      {/* ── Stats ── */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Resumen total</p>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {[
            { label: "Ayunos", value: fastCount.toString() },
            { label: "Horas",  value: `${totalHours.toFixed(0)}h` },
            { label: "Kcal",   value: totalKcal.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl bg-white/5 p-3.5">
              <p className="text-[10px] text-white/40">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-2xl bg-white/5 px-4 py-3">
          <p className="text-[10px] text-white/40">Equivalente en grasa quemada</p>
          <p className="mt-0.5 text-xl font-bold">{totalKgEq} kg</p>
        </div>
      </div>

      {/* ── Fasting history ── */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Historial de ayunos</p>
        {history.length === 0 ? (
          <p className="mt-4 text-xs text-white/35">Aún no hay ayunos completados.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {(showFullHistory ? history : history.slice(0, 3)).map((s) => {
              const kcal    = Math.round((s.duration_hours ?? 0) * KCAL_PER_HOUR);
              const date    = new Date(s.start_time).toLocaleDateString("es-ES", {
                day: "numeric", month: "short", year: "numeric",
              });
              const goalMet = (s.duration_hours ?? 0) >= s.target_hours;

              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold ${goalMet ? "text-green-400" : "text-white/40"}`}>
                      {goalMet ? "✓" : "○"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white/90">
                        {s.duration_hours?.toFixed(1)}h
                        {goalMet && (
                          <span className="ml-1.5 text-[10px] font-normal text-green-400/80">
                            meta cumplida
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-white/40">{date}</p>
                    </div>
                  </div>
                  <p className="text-xs text-white/45">{kcal} kcal</p>
                </div>
              );
            })}

            {!showFullHistory && history.length > 3 && (
              <button
                onClick={() => setShowFullHistory(true)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-xs font-medium text-white/50 transition hover:bg-white/[0.06] hover:text-white/70"
              >
                Ver historial completo ({history.length} registros)
              </button>
            )}
          </div>
        )}
      </div>


    </section>
  );
}
