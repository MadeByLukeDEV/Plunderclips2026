export function GridSkeleton({
  withFilters = false,
  count = 8,
}: {
  withFilters?: boolean;
  count?: number;
}) {
  return (
    <div aria-hidden>
      {withFilters ? (
        <div className="mt-10 flex gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-card h-11 w-24 animate-pulse rounded-full" />
          ))}
        </div>
      ) : null}
      <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>
            <div className="bg-card aspect-video animate-pulse rounded-xl" />
            <div className="bg-card mt-3 h-4 w-4/5 animate-pulse rounded" />
            <div className="bg-card mt-2 h-3 w-1/3 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
