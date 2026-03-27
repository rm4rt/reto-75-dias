"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAppStore } from "@/app/store/useAppStore";
import supabase from "@/lib/supabaseClient";

type PhotoRow = {
  id: string;
  image_path: string;
  day: number;
  note: string;
  created_at: string;
};

type WeightEntry = {
  id: string;
  weight: number;
  day: number;
  created_at: string;
};

function getPublicUrl(path: string) {
  return supabase.storage.from("progress-photos").getPublicUrl(path).data.publicUrl;
}

export default function ProgressPage() {
  const { user } = useUser();
  const { day, weight, updateWeight } = useAppStore();

  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDay, setPendingDay] = useState<string>(String(day));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Weight logging state
  const [weightInput, setWeightInput] = useState<string>(String(weight));
  const [todayEntries, setTodayEntries] = useState<WeightEntry[]>([]);
  const [weightSaving, setWeightSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const fetchPhotos = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("progress_photos")
        .select("*")
        .eq("clerk_user_id", user.id)
        .order("day", { ascending: true });
      if (error) {
        console.error("[Supabase] fetch photos failed:", error);
        return;
      }
      setPhotos(data ?? []);
    };
    fetchPhotos();
  }, [user?.id]);

  // Fetch today's weight entries to enforce max-2-per-day
  useEffect(() => {
    const fetchTodayEntries = async () => {
      if (!user?.id) return;
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("weight_entries")
        .select("*")
        .eq("clerk_user_id", user.id)
        .gte("created_at", `${todayStr}T00:00:00`)
        .lte("created_at", `${todayStr}T23:59:59`)
        .order("created_at", { ascending: true });
      setTodayEntries(data ?? []);
    };
    fetchTodayEntries();
  }, [user?.id]);

  const handleWeightLog = async () => {
    if (!user?.id || todayEntries.length >= 2 || weightSaving) return;
    if (!weightInput.trim() || isNaN(Number(weightInput))) return;
    setWeightSaving(true);
    const numWeight = Number(weightInput);
    const { data, error } = await supabase
      .from("weight_entries")
      .insert({ clerk_user_id: user.id, weight: numWeight, day })
      .select()
      .single();
    if (!error && data) {
      setTodayEntries((prev) => [...prev, data]);
      updateWeight(numWeight);
      showToast("Peso registrado");
    }
    setWeightSaving(false);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const handleDelete = async (photo: PhotoRow) => {
    await supabase.storage.from("progress-photos").remove([photo.image_path]);
    await supabase.from("progress_photos").delete().eq("id", photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    setSelectedIds((prev) => prev.filter((id) => id !== photo.id));
    showToast("Foto eliminada");
  };

  const handleNoteSave = async (photoId: string) => {
    await supabase
      .from("progress_photos")
      .update({ note: editingNoteValue })
      .eq("id", photoId);
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, note: editingNoteValue } : p))
    );
    setEditingNoteId(null);
    showToast("Nota actualizada");
  };

  // Step 1: store the selected file in state
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    console.log("[Upload] File selected:", file?.name ?? "none");
    setPendingFile(file);
    setPendingDay(String(day));
    setUploadError(null);
    setUploadSuccess(false);
  };

  // Step 2: button triggers the actual upload
  const handleUpload = async () => {
    console.log("[Upload] Upload started");
    console.log("[Upload] User:", user?.id ?? "NOT LOADED");
    console.log("[Upload] File:", pendingFile?.name ?? "NO FILE");

    if (!user?.id) {
      setUploadError("Usuario no autenticado. Recarga la página.");
      return;
    }
    if (!pendingFile) {
      setUploadError("Selecciona una foto primero.");
      return;
    }
    if (!pendingDay.trim() || Number(pendingDay) < 1 || Number(pendingDay) > 365) {
      setUploadError("El día debe estar entre 1 y 365.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const ext = pendingFile.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    console.log("[Upload] Path:", path);

    const { data: storageData, error: storageError } = await supabase.storage
      .from("progress-photos")
      .upload(path, pendingFile);

    console.log("[Upload] Storage result — data:", storageData, "error:", storageError);

    if (storageError) {
      setUploadError(`Error al subir imagen: ${storageError.message}`);
      setUploading(false);
      return;
    }

    const { data: insertData, error: insertError } = await supabase
      .from("progress_photos")
      .insert({ clerk_user_id: user.id, image_path: path, day: Number(pendingDay), note: "" });

    console.log("[Upload] Insert result — data:", insertData, "error:", insertError);

    if (insertError) {
      setUploadError(`Error al guardar metadata: ${insertError.message}`);
      setUploading(false);
      return;
    }

    const { data: updated, error: fetchError } = await supabase
      .from("progress_photos")
      .select("*")
      .eq("clerk_user_id", user.id)
      .order("day", { ascending: true });

    if (!fetchError) setPhotos(updated ?? []);

    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadSuccess(true);
    showToast("Foto añadida");
    setUploading(false);
  };

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi progreso</h1>
        <p className="mt-1 text-sm text-white/60">
          Registra tu peso y compara tu evolución visual.
        </p>
      </div>

      {/* ── Daily weight log ── */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Peso de hoy</p>

        {todayEntries.length >= 2 ? (
          <div className="mt-3">
            <p className="text-sm text-white/60">Ya has registrado 2 pesos hoy.</p>
            <div className="mt-3 flex flex-col gap-2">
              {todayEntries.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2.5">
                  <p className="text-sm font-semibold text-white/90">
                    {Number(e.weight).toFixed(1)} kg
                  </p>
                  <p className="text-xs text-white/40">
                    {new Date(e.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="number"
                inputMode="decimal"
                step={0.1}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-28 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
              />
              <span className="text-sm text-white/50">kg</span>
              <button
                onClick={handleWeightLog}
                disabled={weightSaving}
                className="ml-auto rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:opacity-50"
              >
                {weightSaving ? "…" : "Registrar"}
              </button>
            </div>

            {todayEntries.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {todayEntries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2.5">
                    <p className="text-sm font-semibold text-white/90">
                      {Number(e.weight).toFixed(1)} kg
                    </p>
                    <p className="text-xs text-white/40">
                      {new Date(e.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
                <p className="mt-1 text-xs text-white/35">
                  {2 - todayEntries.length} registro más disponible hoy
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {(() => {
        const photoA = selectedIds[0] ? photos.find((p) => p.id === selectedIds[0]) : null;
        const photoB = selectedIds[1] ? photos.find((p) => p.id === selectedIds[1]) : null;
        const comparing = photoA && photoB;

        const formatDate = (iso: string) =>
          new Date(iso).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });

        return (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-sm font-semibold text-white/80">
              Comparador antes y después
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold text-white/90">Antes</p>
                {comparing ? (
                  <>
                    <div className="mt-2 aspect-[4/3] w-full overflow-hidden rounded-xl bg-white/10">
                      <img
                        src={getPublicUrl(photoA.image_path)}
                        alt={`Día ${photoA.day}`}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-white/90">Día {photoA.day}</p>
                      <p className="text-xs text-white/50">{formatDate(photoA.created_at)}</p>
                      {photoA.note ? <p className="mt-1 text-xs text-white/60">{photoA.note}</p> : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-2 aspect-[4/3] w-full rounded-xl bg-white/10" />
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-white/90">Día 1</p>
                      <p className="text-xs text-white/50">12 mar 2026</p>
                      <p className="mt-1 text-xs text-white/60">Frontal</p>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold text-white/90">Después</p>
                {comparing ? (
                  <>
                    <div className="mt-2 aspect-[4/3] w-full overflow-hidden rounded-xl bg-white/10">
                      <img
                        src={getPublicUrl(photoB.image_path)}
                        alt={`Día ${photoB.day}`}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-white/90">Día {photoB.day}</p>
                      <p className="text-xs text-white/50">{formatDate(photoB.created_at)}</p>
                      {photoB.note ? <p className="mt-1 text-xs text-white/60">{photoB.note}</p> : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-2 aspect-[4/3] w-full rounded-xl bg-white/10" />
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-white/90">Día 30</p>
                      <p className="text-xs text-white/50">10 abr 2026</p>
                      <p className="mt-1 text-xs text-white/60">Perfil</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <p className="mt-4 text-sm text-white/60">
              {comparing
                ? `Diferencia: ${Math.abs(photoB.day - photoA.day)} días`
                : "Diferencia: 30 días"}
            </p>
          </div>
        );
      })()}

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white/80">
              Galería de progreso
            </h2>
            <p className="mt-1 text-xs text-white/60">
              Selecciona 2 fotos para comparar
            </p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
          >
            Elegir foto
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {pendingFile && (
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="truncate text-xs text-white/70">{pendingFile.name}</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <span className="text-xs text-white/60">Día</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={pendingDay}
                  onChange={(e) => setPendingDay(e.target.value)}
                  className="w-16 rounded-xl bg-white/10 px-3 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:bg-white/20"
                />
              </label>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="ml-auto shrink-0 rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-black transition hover:scale-[1.02] disabled:opacity-50"
              >
                {uploading ? "Subiendo…" : "Subir foto"}
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <p className="mt-2 text-xs text-red-400">{uploadError}</p>
        )}


        {photos.length === 0 ? (
          <p className="mt-6 text-center text-xs text-white/40">
            Aún no has subido ninguna foto.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {photos.map((photo) => {
              const isSelected = selectedIds.includes(photo.id);
              const url = getPublicUrl(photo.image_path);
              const dateLabel = new Date(photo.created_at).toLocaleDateString(
                "es-ES",
                { day: "numeric", month: "short", year: "numeric" }
              );
              // subtle brightness ramp: later days get a slightly lighter card
              const progress = Math.min(photo.day / 75, 1);
              const bgAlpha = 0.04 + progress * 0.06;

              const isEditing = editingNoteId === photo.id;

              return (
                <div
                  key={photo.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelected(photo.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSelected(photo.id);
                    }
                  }}
                  style={{ background: `rgba(255,255,255,${bgAlpha})` }}
                  className={[
                    "relative rounded-2xl border p-3 transition-all duration-200 hover:scale-[1.02] hover:border-white/30 cursor-pointer",
                    isSelected ? "border-white/70" : "border-white/10",
                  ].join(" ")}
                >
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(photo); }}
                    className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white/70 hover:bg-black/80 hover:text-white"
                  >
                    ×
                  </button>

                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-white/10">
                    <img
                      src={url}
                      alt={`Día ${photo.day}`}
                      className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
                    />
                  </div>

                  <div className="mt-3">
                    <p className="text-base font-bold text-white/90">Día {photo.day}</p>
                    <p className="mt-0.5 text-xs text-white/50">{dateLabel}</p>

                    {isEditing ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 flex flex-col gap-1"
                      >
                        <input
                          autoFocus
                          value={editingNoteValue}
                          onChange={(e) => setEditingNoteValue(e.target.value)}
                          placeholder="Nota..."
                          className="w-full rounded-xl bg-white/10 px-2 py-1 text-xs text-white outline-none"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleNoteSave(photo.id)}
                            className="rounded-lg bg-white px-2 py-0.5 text-xs font-semibold text-black"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingNoteId(null)}
                            className="rounded-lg bg-white/10 px-2 py-0.5 text-xs text-white/70"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingNoteId(photo.id);
                          setEditingNoteValue(photo.note ?? "");
                        }}
                        className="mt-1 text-xs text-white/50 hover:text-white/80 cursor-text"
                      >
                        {photo.note || "Añadir nota…"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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