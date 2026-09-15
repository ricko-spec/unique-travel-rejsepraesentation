import Image from "next/image";

type Props = {
  images: string[];
  destination: string;
};

// Designet specificerer ingen billedtekst-data (kun URL'er i destinations.gallery),
// og DO-NOT-CHANGE §2 forbyder opdigtet indhold — derfor ingen caption her.
export function DestinationGallery({ images, destination }: Props) {
  const filtered = images.filter((u) => typeof u === "string" && u.length > 0).slice(0, 3);
  if (filtered.length === 0) return null;

  const colsClass = filtered.length === 2 ? "cols-2" : filtered.length >= 3 ? "cols-3" : "";
  const sizes =
    filtered.length === 1
      ? "(min-width: 760px) 1180px, 100vw"
      : filtered.length === 2
        ? "(min-width: 760px) 50vw, 100vw"
        : "(min-width: 760px) 33vw, 100vw";

  return (
    <section>
      <div className={`gallery ${colsClass}`.trim()}>
        {filtered.map((url, i) => (
          <div key={url + i} className="gallery-item">
            <Image
              src={url}
              alt={`${destination} – billede ${i + 1}`}
              fill
              sizes={sizes}
              className="gallery-photo"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
