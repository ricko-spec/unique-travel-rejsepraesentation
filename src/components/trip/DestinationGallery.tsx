import Image from "next/image";
import { filterGalleryImages } from "@/lib/progress-nav";

type Props = {
  images: string[];
  destination: string;
};

// Designet specificerer ingen billedtekst-data (kun URL'er i destinations.gallery),
// og DO-NOT-CHANGE §2 forbyder opdigtet indhold — derfor ingen caption her.
export function DestinationGallery({ images, destination }: Props) {
  // Samme filter som progress-nav'en bruger til "har billeder"-betingelsen
  // (src/lib/progress-nav.ts) — én kilde til sandhed, så BILLEDER-anker'et
  // aldrig kan komme ud af trit med om galleriet reelt viser noget.
  const filtered = filterGalleryImages(images);
  if (filtered.length === 0) return null;

  const colsClass = filtered.length === 2 ? "cols-2" : filtered.length >= 3 ? "cols-3" : "";
  const sizes =
    filtered.length === 1
      ? "(min-width: 760px) 1180px, 100vw"
      : filtered.length === 2
        ? "(min-width: 760px) 50vw, 100vw"
        : "(min-width: 760px) 33vw, 100vw";

  return (
    <section id="billeder">
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
