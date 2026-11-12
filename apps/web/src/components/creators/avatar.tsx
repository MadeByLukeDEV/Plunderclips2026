import { cn } from "@plunderclips/ui/lib/utils";

/** Avatar from the sign-in platform, or the first letter of the name on parchment. */
export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "band-parchment bg-background text-foreground relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from each platform's CDN
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="font-display text-[0.45em] leading-none" aria-hidden>
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
