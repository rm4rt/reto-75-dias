"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAppStore } from "@/app/store/useAppStore";
import supabase from "@/lib/supabaseClient";

function getBmiCategory(bmi: number): {
  label: string;
  color: string;
  message: string;
} {
  if (bmi < 18.5)
    return {
      label: "Bajo peso",
      color: "text-white/60",
      message: "Tu peso está por debajo del rango habitual.",
    };
  if (bmi < 25)
    return {
      label: "Normal",
      color: "text-green-400",
      message: "Estás dentro del rango habitual.",
    };
  if (bmi < 30)
    return {
      label: "Sobrepeso",
      color: "text-yellow-400",
      message: "Hay margen de mejora si tu objetivo es recomposición.",
    };
  return {
    label: "Obesidad",
    color: "text-red-400",
    message: "Tu punto de partida requiere constancia y progresión.",
  };
}

export default function ProfilePage() {
  const { user } = useUser();
  const {
    startWeight,
    goalWeight,
    day,
    weight,
    heightCm,
    updateStartWeight,
    updateGoalWeight,
    updateHeightCm,
    updateWeight,
    setDay,
  } = useAppStore();

  const [localStartWeight, setLocalStartWeight] = useState(String(startWeight));
  const [localGoalWeight, setLocalGoalWeight] = useState(String(goalWeight));
  const [localDay, setLocalDay] = useState(String(day));
  const [localHeightCm, setLocalHeightCm] = useState(String(heightCm));

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleSave = async () => {
    if (!user?.id) {
      setError("Usuario no autenticado.");
      return;
    }
    if (!localDay.trim() || Number(localDay) < 1 || Number(localDay) > 365) {
      setError("El día debe estar entre 1 y 365.");
      return;
    }
    if (!localStartWeight.trim() || !localGoalWeight.trim()) {
      setError("Los pesos no pueden estar vacíos.");
      return;
    }
    if (!localHeightCm.trim() || Number(localHeightCm) < 100 || Number(localHeightCm) > 250) {
      setError("La altura debe estar entre 100 y 250 cm.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error: supabaseError } = await supabase
      .from("profiles")
      .update({
        start_weight: Number(localStartWeight),
        goal_weight: Number(localGoalWeight),
        day: Number(localDay),
        height_cm: Number(localHeightCm),
      })
      .eq("clerk_user_id", user.id);

    if (supabaseError) {
      setError(`Error al guardar: ${supabaseError.message}`);
      setSaving(false);
      return;
    }

    updateStartWeight(Number(localStartWeight));
    updateGoalWeight(Number(localGoalWeight));
    setDay(Number(localDay));
    updateHeightCm(Number(localHeightCm));

    setSuccess(true);
    setSaving(false);
  };

  const handleReset = async () => {
    if (!user?.id) return;
    setResetting(true);

    // Delete storage files
    const { data: files } = await supabase.storage
      .from("progress-photos")
      .list(user.id);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${f.name}`);
      await supabase.storage.from("progress-photos").remove(paths);
    }

    // Delete database rows
    await Promise.all([
      supabase.from("weight_entries").delete().eq("clerk_user_id", user.id),
      supabase.from("fasting_sessions").delete().eq("clerk_user_id", user.id),
      supabase.from("progress_photos").delete().eq("clerk_user_id", user.id),
    ]);

    // Reset local store to day 1 + start weight
    setDay(1);
    updateWeight(startWeight);

    setResetting(false);
    setShowResetConfirm(false);
  };

  const heightM = Number(localHeightCm) / 100;
  const bmi = heightM > 0 ? Number(localStartWeight) / (heightM * heightM) : null;
  const bmiCategory = bmi !== null ? getBmiCategory(bmi) : null;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-white/60">
          Configura tu punto de partida para llevar un seguimiento preciso de tu evolución.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/60">Peso inicial (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              value={localStartWeight}
              onChange={(e) => setLocalStartWeight(e.target.value)}
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/60">Peso meta (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              value={localGoalWeight}
              onChange={(e) => setLocalGoalWeight(e.target.value)}
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/60">Altura (cm)</span>
            <input
              type="number"
              inputMode="numeric"
              min={100}
              max={250}
              value={localHeightCm}
              onChange={(e) => setLocalHeightCm(e.target.value)}
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-white/60">Día de referencia</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={localDay}
              onChange={(e) => setLocalDay(e.target.value)}
              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
            />
          </label>
        </div>

        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
        {success && (
          <p className="mt-4 text-xs text-green-400">Configuración guardada.</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:scale-[1.01] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>

      {bmi !== null && bmiCategory !== null && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Estado corporal
          </p>
          <div className="mt-3 flex items-end gap-3">
            <p className="text-5xl font-bold">{bmi.toFixed(1)}</p>
            <p className={`mb-1 text-lg font-semibold ${bmiCategory.color}`}>
              {bmiCategory.label}
            </p>
          </div>
          <p className="mt-2 text-sm text-white/60">{bmiCategory.message}</p>
          <p className="mt-4 text-xs text-white/30">
            La estimación de grasa corporal requiere más datos y se añadirá más adelante.
          </p>
        </div>
      )}

      {/* ── Danger zone ── */}
      <div className="rounded-3xl border border-red-500/15 bg-white/[0.02] p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-red-400/60">Zona peligrosa</p>
        <p className="mt-2 text-sm text-white/50">
          Borra todo el historial y empieza desde cero. Esta acción no se puede deshacer.
        </p>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
        >
          Borrar todo el historial
        </button>
      </div>

      {/* ── Reset confirmation dialog ── */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-900 p-6">
            <p className="text-base font-semibold text-white/90">
              ¿Seguro que quieres borrar todo el historial?
            </p>
            <p className="mt-2 text-sm text-white/50">
              Se eliminarán todos tus ayunos, registros de peso y fotos. Tu cuenta permanece intacta.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
              >
                {resetting ? "Borrando…" : "Borrar"}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="flex-1 rounded-2xl bg-green-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-400 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
