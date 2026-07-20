"use client";

import { useEffect, useRef, useState } from "react";

type Destination = {
  name: string;
  hero_url: string | null;
  gallery: string[];
  updated_at: string;
};

type Slot = "hero" | "gallery-0" | "gallery-1" | "gallery-2";

export function DestinationManager() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/admin/api/destinations", { cache: "no-store" });
      if (!res.ok) throw new Error("Kunne ikke hente destinationer");
      const data = await res.json();
      setDestinations(data.destinations || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Udtræk serverens fejlbesked; falder svaret ikke ud som JSON (fx en
  // platform-fejlside), vis i det mindste HTTP-status så fejlen kan handles på.
  async function extractError(res: Response, fallback: string): Promise<string> {
    const j = await res.json().catch(() => null);
    if (j && typeof j.error === "string" && j.error) return j.error;
    return `${fallback} (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""})`;
  }

  async function handleUpload(
    destination: string,
    slot: Slot,
    file: File,
  ) {
    const key = `${destination}:${slot}`;
    setUploadingKey(key);
    setError(null);
    try {
      // 1) Bed serveren om en signeret Storage-URL (auth + validering af
      //    slot/størrelse/filtype sker her).
      const initRes = await fetch("/admin/api/destinations/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          slot,
          size: file.size,
          mime: file.type || "application/octet-stream",
        }),
      });
      if (!initRes.ok) {
        throw new Error(await extractError(initRes, "Kunne ikke starte upload"));
      }
      const { signedUrl, path } = await initRes.json();

      // 2) Upload originalen DIREKTE til Supabase Storage — udenom Vercel,
      //    hvis platform-grænse på 4,5 MB ellers afviser store originaler
      //    før vores kode overhovedet kører.
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(
          `Upload til billedlageret fejlede (HTTP ${putRes.status}) — prøv igen`,
        );
      }

      // 3) Bed serveren behandle billedet (magic bytes, resize, WebP).
      const upRes = await fetch("/admin/api/destinations/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, destination, slot }),
      });
      if (!upRes.ok) {
        throw new Error(await extractError(upRes, "Billedbehandling fejlede"));
      }
      const { url } = await upRes.json();
      const current = destinations.find((d) => d.name === destination);
      const payload: { name: string; hero_url?: string; gallery?: string[] } = {
        name: destination,
      };
      if (slot === "hero") {
        payload.hero_url = url;
      } else {
        const idx = Number(slot.replace("gallery-", ""));
        const gallery = [...(current?.gallery || [])];
        while (gallery.length <= idx) gallery.push("");
        gallery[idx] = url;
        payload.gallery = gallery.filter((u) => !!u);
      }
      const metaRes = await fetch("/admin/api/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!metaRes.ok) {
        throw new Error(await extractError(metaRes, "Kunne ikke gemme billed-URL"));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setUploadingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-stone-500 py-6">Henter destinationer...</div>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl text-stone-900">
          Destinationsbilleder
        </h2>
        <p className="text-sm text-stone-600 mt-1">
          Fælles billedbibliotek pr. land. Alle rejser til samme land bruger
          disse billeder automatisk.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {destinations.length === 0 ? (
        <div className="text-sm text-stone-500">
          Ingen destinationer endnu. De oprettes automatisk når en
          rejsepræsentation parses.
        </div>
      ) : (
        <div className="space-y-10">
          {destinations.map((dest) => (
            <DestinationRow
              key={dest.name}
              destination={dest}
              uploadingKey={uploadingKey}
              onUpload={handleUpload}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type RowProps = {
  destination: Destination;
  uploadingKey: string | null;
  onUpload: (destination: string, slot: Slot, file: File) => void;
};

function DestinationRow({ destination, uploadingKey, onUpload }: RowProps) {
  return (
    <div className="border border-stone-200 rounded-2xl p-6 bg-white">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-serif text-xl text-stone-900">{destination.name}</h3>
        <span className="text-xs text-stone-400">
          Opdateret {new Date(destination.updated_at).toLocaleString("da-DK")}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ImageSlot
          label="Hero"
          url={destination.hero_url}
          slot="hero"
          destination={destination.name}
          uploading={uploadingKey === `${destination.name}:hero`}
          onUpload={onUpload}
          aspect="aspect-[16/9]"
        />
        {[0, 1, 2].map((i) => (
          <ImageSlot
            key={i}
            label={`Galleri ${i + 1}`}
            url={destination.gallery[i] ?? null}
            slot={`gallery-${i}` as Slot}
            destination={destination.name}
            uploading={uploadingKey === `${destination.name}:gallery-${i}`}
            onUpload={onUpload}
            aspect="aspect-[4/3]"
          />
        ))}
      </div>
    </div>
  );
}

type SlotProps = {
  label: string;
  url: string | null;
  slot: Slot;
  destination: string;
  uploading: boolean;
  aspect: string;
  onUpload: (destination: string, slot: Slot, file: File) => void;
};

function ImageSlot({
  label,
  url,
  slot,
  destination,
  uploading,
  aspect,
  onUpload,
}: SlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-stone-500 mb-2">
        {label}
      </p>
      <div
        className={`relative ${aspect} bg-stone-100 rounded-lg overflow-hidden border border-stone-200`}
      >
        {url ? (
          <img
            src={url}
            alt={`${destination} ${label}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-400">
            Intet billede
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-2 text-sm text-stone-700">
            <span className="admin-spinner" />
            Behandler billede...
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(destination, slot, file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="mt-2 w-full text-xs bg-stone-900 text-white py-2 rounded-md hover:bg-stone-800 disabled:opacity-50"
      >
        {url ? "Skift billede" : "Upload"}
      </button>
    </div>
  );
}
