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
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  // Magic-byte-sniff af filens første bytes — extension og MIME-type kan
  // begge lyve; det kan de faktiske bytes ikke.
  async function sniffMime(file: File): Promise<string | null> {
    const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
      return "image/png";
    const ascii = (from: number, to: number) =>
      String.fromCharCode(...buf.slice(from, to));
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
    if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12)))
      return "image/avif";
    return null;
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
      // 0) Lokal validering før noget sendes: størrelse + faktisk indhold.
      if (file.size > 50 * 1024 * 1024) {
        throw new Error(
          `Filen er for stor (max 50 MB) — den er ${(file.size / 1024 / 1024).toFixed(1)} MB`,
        );
      }
      const mime = await sniffMime(file);
      if (!mime) {
        throw new Error(
          "Filen ser ikke ud til at være et gyldigt billede (JPEG/PNG/WebP/AVIF)",
        );
      }

      // 1) Bed serveren om en signeret Storage-URL (auth + slot-validering).
      const initRes = await fetch("/admin/api/destinations/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, slot }),
      });
      if (!initRes.ok) {
        throw new Error(await extractError(initRes, "Kunne ikke få upload-tilladelse"));
      }
      const { signedUrl, path } = await initRes.json();

      // 2) Upload originalen DIREKTE til Supabase Storage — udenom Vercels
      //    4,5 MB body-grænse. Content-Type fra sniff (bucketens MIME-
      //    allowlist håndhæver jpeg/png/webp/avif).
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload til Supabase fejlede (HTTP ${putRes.status})`);
      }

      // 3) Bed serveren behandle billedet (magic bytes, resize, WebP) —
      //    finalize opdaterer også destinations-rækken og rydder staging op.
      const finRes = await fetch("/admin/api/destinations/finalize-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, slot, stagingPath: path }),
      });
      if (!finRes.ok) {
        throw new Error(await extractError(finRes, "Behandling fejlede"));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const name = newName.trim();
    if (!name) {
      setCreateError("Indtast et destinationsnavn");
      return;
    }
    // Case-insensitivt dublet-tjek mod den indlæste liste — serveren tjekker
    // også, men her fanges det uden et roundtrip.
    const dup = destinations.find(
      (d) => d.name.toLowerCase() === name.toLowerCase(),
    );
    if (dup) {
      setCreateError(`Destinationen "${dup.name}" findes allerede`);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/admin/api/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        throw new Error(await extractError(res, "Kunne ikke oprette destinationen"));
      }
      setNewName("");
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setCreating(false);
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
          disse billeder automatisk. Destinationer oprettes manuelt her,
          hvorefter hero- og galleribilleder kan uploades. Kundesiden bruger
          rejsens eget billede eller en gradient som fallback, hvis der endnu
          ikke findes billeder.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="border border-stone-200 rounded-2xl p-4 bg-white flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[220px]">
          <label
            htmlFor="new-destination"
            className="block text-xs uppercase tracking-wider text-stone-500 mb-2"
          >
            Opret destination
          </label>
          <input
            id="new-destination"
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-900 focus:outline-none focus:border-stone-400"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="fx Japan"
            disabled={creating}
          />
        </div>
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="text-xs bg-stone-900 text-white px-4 py-2.5 rounded-md hover:bg-stone-800 disabled:opacity-50"
        >
          {creating ? "Opretter..." : "Opret"}
        </button>
        {createError && (
          <p className="w-full text-sm text-red-700 mt-1">{createError}</p>
        )}
      </form>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {destinations.length === 0 ? (
        <div className="text-sm text-stone-500">
          Ingen destinationer endnu — opret den første ovenfor.
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
