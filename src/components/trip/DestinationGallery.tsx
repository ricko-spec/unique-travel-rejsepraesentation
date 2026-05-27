type Props = {
  images: string[];
  destination: string;
};

export function DestinationGallery({ images, destination }: Props) {
  const filtered = images.filter((u) => typeof u === "string" && u.length > 0).slice(0, 3);
  if (filtered.length === 0) return null;

  return (
    <section className="px-4 md:px-8 py-12 md:py-16">
      <div className="max-w-5xl mx-auto">
        <div
          className={`grid gap-3 md:gap-4 ${
            filtered.length === 1
              ? "grid-cols-1"
              : filtered.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : "grid-cols-1 md:grid-cols-3"
          }`}
        >
          {filtered.map((url, i) => (
            <div
              key={url + i}
              className="aspect-[4/3] overflow-hidden rounded-lg bg-stone-100"
            >
              <img
                src={url}
                alt={`${destination} – billede ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
