"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/app/store/useAppStore";
import { useUser } from "@clerk/nextjs";
import supabase from "@/lib/supabaseClient";

export default function DashboardPage() {
  const {
    day,
    weight,
    startWeight,
    goalWeight,
    updateWeight,
    updateStartWeight,
    updateGoalWeight,
    addDay,
    setProfileData,
  } = useAppStore();

  const router = useRouter();
  const { user } = useUser();
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);
  const [localWeight, setLocalWeight] = useState(weight);
  const [weightSaved, setWeightSaved] = useState<"idle" | "saved" | "updated">("idle");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [activeDays, setActiveDays] = useState<Set<number>>(new Set());
  const [todayWeightDone, setTodayWeightDone] = useState(false);

  useEffect(() => {
    const fetchActivity = async () => {
      if (!user?.id) return;
      const [{ data, error }, { data: weightData }] = await Promise.all([
        supabase.from("progress_photos").select("day").eq("clerk_user_id", user.id),
        supabase
          .from("weight_entries")
          .select("id")
          .eq("clerk_user_id", user.id)
          .eq("day", day)
          .maybeSingle(),
      ]);
      if (error || !data) return;
      setTodayWeightDone(!!weightData);

      const uniqueDays = [...new Set(data.map((r) => r.day as number))];
      setActiveDays(new Set(uniqueDays));

      const sorted = [...uniqueDays].sort((a, b) => b - a);

      // current streak
      let count = 0;
      let expected = day;
      for (const d of sorted) {
        if (d === expected) { count++; expected--; }
        else if (d < expected) break;
      }
      setStreak(count);

      // best streak: scan ascending, count max consecutive run
      const asc = [...uniqueDays].sort((a, b) => a - b);
      let best = 0;
      let run = asc.length > 0 ? 1 : 0;
      for (let i = 1; i < asc.length; i++) {
        if (asc[i] === asc[i - 1] + 1) {
          run++;
        } else {
          run = 1;
        }
        if (run > best) best = run;
      }
      if (asc.length === 1) best = 1;
      setBestStreak(best);
    };
    fetchActivity();
  }, [user?.id, day]);

  const completedDays = day - 1;
  const remainingDays = 75 - day;
  const progressPercentage = (day / 75) * 100;

  useEffect(() => {
    const runSync = async () => {
      if (!user?.id) return;

      setHasLoadedProfile(false);

      // If the profile row doesn't exist yet, create it with defaults.
      const { data, error } = await supabase
        .from("profiles")
        .select("clerk_user_id")
        .eq("clerk_user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[Supabase] profile lookup failed:", error);
        return;
      }

      // If the row doesn't exist, create it. Then we always fetch the full row.
      if (!data) {
        const { error: insertError } = await supabase
          .from("profiles")
          .insert({
            clerk_user_id: user.id,
            day: 1,
            weight: 80,
            start_weight: 80,
            goal_weight: 75,
          });

        if (insertError) {
          console.error("[Supabase] profile insert failed:", insertError);
        }
      }

      const { data: fullRow, error: fullRowError } = await supabase
        .from("profiles")
        .select("*")
        .eq("clerk_user_id", user.id)
        .maybeSingle();

      if (fullRowError) {
        console.error("[Supabase] profile fetch failed:", fullRowError);
        return;
      }

      if (!fullRow) return;

      setProfileData({
        day: Number(fullRow.day),
        weight: Number(fullRow.weight),
        startWeight: Number(fullRow.start_weight),
        goalWeight: Number(fullRow.goal_weight),
      });

      setHasLoadedProfile(true);
    };

    runSync();
  }, [user?.id]);

  useEffect(() => {
    const runSave = async () => {
      if (!user?.id) return;
      if (!hasLoadedProfile) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          day: Number(day),
          weight: Number(weight),
          start_weight: Number(startWeight),
          goal_weight: Number(goalWeight),
        })
        .eq("clerk_user_id", user.id);

      if (error) {
        console.error("[Supabase] profile update failed:", error);
      }
    };

    runSave();
  }, [user?.id, hasLoadedProfile, day, weight, startWeight, goalWeight]);

  const completedActivityDays = activeDays.size;
  const disciplineScore = day > 0 ? Math.round((completedActivityDays / day) * 100) : 0;
  const disciplineMessage =
    disciplineScore >= 90
      ? "Vas imparable"
      : disciplineScore >= 75
      ? "Muy buena constancia"
      : disciplineScore >= 50
      ? "Vas bien, pero no aflojes"
      : "Todavía estás a tiempo de remontar";

  const handleWeightSave = async () => {
    if (!user?.id) return;
    setWeightSaved("idle");
    updateWeight(localWeight);

    await supabase
      .from("profiles")
      .update({ weight: Number(localWeight) })
      .eq("clerk_user_id", user.id);

    const { data: existing } = await supabase
      .from("weight_entries")
      .select("id")
      .eq("clerk_user_id", user.id)
      .eq("day", day)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("weight_entries")
        .update({ weight: Number(localWeight) })
        .eq("id", existing.id);
      setWeightSaved("updated");
      showToast("Peso actualizado");
    } else {
      await supabase
        .from("weight_entries")
        .insert({ clerk_user_id: user.id, weight: Number(localWeight), day });
      setWeightSaved("saved");
      showToast("Peso registrado");
    }
    setTodayWeightDone(true);

    setTimeout(() => setWeightSaved("idle"), 2500);
  };

  const streakMessage =
    streak >= 20
      ? "Estás en tu mejor racha"
      : streak >= 10
      ? "No rompas la cadena"
      : streak >= 5
      ? "Vas fuerte"
      : "Sube una foto cada día para construir tu racha";

  const todayDone = activeDays.has(day);

  const nudge = !todayDone
    ? streak >= 5
      ? `Llevas ${streak} días seguidos. ¿Lo vas a romper hoy?`
      : "Hoy es un buen día para empezar en serio"
    : streak >= 10
    ? "Estás construyendo algo muy serio"
    : streak >= 5
    ? "Vas fuerte. No aflojes"
    : disciplineScore >= 80
    ? "Estás por encima de la mayoría"
    : disciplineScore < 50
    ? "Todavía puedes darle la vuelta"
    : "Buen trabajo hoy";

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Hoy</p>
        {todayDone ? (
          <>
            <p className="mt-2 text-base font-semibold text-white/90">Ya has cumplido hoy</p>
            <p className="mt-1 text-sm text-white/50">Sigue así</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-base font-semibold text-white/90">
              Aún no has registrado tu progreso hoy
            </p>
            <button
              onClick={() => router.push("/progress")}
              className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:scale-[1.01]"
            >
              Subir foto ahora
            </button>
          </>
        )}
      </div>

      <p className="px-1 text-sm font-medium text-white/50">{nudge}</p>

      {(() => {
        const fullCompletion = todayDone && todayWeightDone;
        const partial = todayDone || todayWeightDone;
        const summaryMessage = fullCompletion
          ? "Hoy has hecho lo que tenías que hacer"
          : partial
          ? "Vas bien, pero aún puedes completar el día"
          : "No dejes el día vacío";

        return (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Resumen de hoy</p>

            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className={todayDone ? "text-white/90" : "text-white/30"}>
                  {todayDone ? "✓" : "○"}
                </span>
                <span className={`text-sm ${todayDone ? "text-white/90" : "text-white/40"}`}>
                  Día {day} {todayDone ? "completado" : "pendiente"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={todayWeightDone ? "text-white/90" : "text-white/30"}>
                  {todayWeightDone ? "✓" : "○"}
                </span>
                <span className={`text-sm ${todayWeightDone ? "text-white/90" : "text-white/40"}`}>
                  Peso {todayWeightDone ? "registrado" : "pendiente"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-white/90">🔥</span>
                <span className="text-sm text-white/80">
                  Racha actual: {streak} {streak === 1 ? "día" : "días"}
                </span>
              </div>
            </div>

            <p className="mt-3 text-sm text-white/50">{summaryMessage}</p>
          </div>
        );
      })()}

      {streak > 0 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
          <p className="text-2xl font-bold">🔥 {streak} {streak === 1 ? "día seguido" : "días seguidos"}</p>
          <p className="mt-1 text-sm text-white/60">{streakMessage}</p>
        </div>
      )}

      {bestStreak > 0 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
          <p className="text-sm font-semibold text-white/80">
            Mejor racha: {bestStreak} {bestStreak === 1 ? "día" : "días"}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {streak < bestStreak
              ? `Estás a ${bestStreak - streak} ${bestStreak - streak === 1 ? "día" : "días"} de tu mejor racha`
              : streak === bestStreak
              ? "Estás igualando tu mejor racha"
              : "Nuevo récord"}
          </p>
        </div>
      )}

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-4">Logros</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { emoji: "🔥", label: "Primer impulso", days: 3 },
            { emoji: "⚡", label: "Constancia inicial", days: 7 },
            { emoji: "🧠", label: "Disciplina sólida", days: 15 },
            { emoji: "🏆", label: "Nivel imparable", days: 30 },
          ].map(({ emoji, label, days }) => {
            const unlocked = streak >= days;
            return (
              <div
                key={days}
                className={[
                  "rounded-2xl border p-4 transition",
                  unlocked
                    ? "border-white/20 bg-white/10"
                    : "border-white/5 bg-white/[0.02] opacity-40",
                ].join(" ")}
              >
                <p className="text-2xl">{emoji}</p>
                <p className={`mt-2 text-xs font-semibold ${unlocked ? "text-white/90" : "text-white/50"}`}>
                  {label}
                </p>
                <p className="mt-0.5 text-xs text-white/40">{days} días</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">75 días</p>
        <div className="grid grid-cols-[repeat(10,minmax(0,1fr))] gap-1.5">
          {Array.from({ length: 75 }, (_, i) => {
            const d = i + 1;
            const done = activeDays.has(d);
            const current = d === day;
            return (
              <div
                key={d}
                title={`Día ${d}`}
                className={[
                  "aspect-square rounded-sm transition-opacity duration-150 hover:opacity-80",
                  done
                    ? "bg-white"
                    : current && !todayDone
                    ? "bg-amber-400/60 ring-2 ring-amber-400 scale-110"
                    : current && todayDone
                    ? "bg-white ring-2 ring-white/80 scale-110"
                    : "bg-white/10",
                ].join(" ")}
              />
            );
          })}
        </div>
        <p className="mt-3 text-xs font-medium">
          {todayDone
            ? <span className="text-white/50">Cadena intacta</span>
            : <span className="text-amber-400/80">Este hueco va a doler mañana</span>}
        </p>
        <div className="mt-2 flex gap-4 text-xs text-white/40">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-white" />Con foto</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400/60 ring-1 ring-amber-400" />Hoy</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-white/10" />Pendiente</span>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Disciplina</p>
        <p className="mt-2 text-5xl font-bold">{disciplineScore}%</p>
        <p className="mt-1 text-sm text-white/60">
          Has cumplido {completedActivityDays} de {day} días
        </p>
        <p className="mt-2 text-sm text-white/50">{disciplineMessage}</p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 hover:border-white/20 transition">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Día actual
        </p>

        <div className="mt-3">
          <p className="text-6xl font-bold leading-none">{day}</p>
          <p className="mt-2 text-lg text-white/70">de 75 días</p>
          <p className="mt-3 text-sm text-white/50">
            Sigues dentro. No rompas la cadena.
          </p>
        </div>

        <div className="mt-6">
          <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-white to-white/60"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="mt-3 flex justify-between text-sm text-white/60">
            <span>{completedDays} completados</span>
            <span>{remainingDays} restantes</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          className="rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-black shadow-lg transition hover:scale-[1.02]"
          onClick={() => updateWeight(weight - 0.5)}
        >
          + Peso
        </button>

        <button className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-semibold text-white transition hover:bg-white/20 hover:scale-[1.02]">
          📸 Foto
        </button>

        <button className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-semibold text-white transition hover:bg-white/20 hover:scale-[1.02]">
          ⏱ Ayuno
        </button>
      </div>

      <button
        className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
        onClick={() => addDay()}
      >
        Pasar al día siguiente
      </button>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
        <p className="text-sm text-white/60">Última foto</p>

        <div className="mt-4 flex items-center gap-4">
          <div className="h-20 w-20 rounded-2xl bg-white/10" />

          <div>
            <p className="font-semibold">Día 10</p>
            <p className="text-sm text-white/60">12 mar 2026</p>
            <p className="mt-1 text-sm text-white/60">Frontal</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
        <p className="text-sm text-white/60">Tu estado actual</p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Actual</p>
            <p className="mt-1 text-xl font-bold">
              {weight} kg
            </p>
          </div>

          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Inicio</p>
            <p className="mt-1 text-xl font-bold">
              {startWeight} kg
            </p>
          </div>

          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Meta</p>
            <p className="mt-1 text-xl font-bold">
              {goalWeight} kg
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
        <p className="text-sm text-white/60">Actualizar datos</p>

        <div className="mt-4">
          <span className="text-xs text-white/60">Peso actual</span>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={localWeight}
              onChange={(e) => { setLocalWeight(Number(e.target.value)); setWeightSaved("idle"); }}
              className="flex-1 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
            <button
              onClick={handleWeightSave}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:scale-[1.03]"
            >
              ✓
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition">
        <p className="text-sm text-white/60">Ayuno activo</p>
        <p className="mt-3 text-3xl font-bold">14h 32m</p>
        <p className="text-sm text-white/60">En curso</p>
      </div>

      <div
        className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-neutral-800 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all duration-300",
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
        ].join(" ")}
      >
        {toast}
      </div>
    </section>
  );
}