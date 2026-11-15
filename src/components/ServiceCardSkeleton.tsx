export function ServiceCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl aspect-[16/10] sm:aspect-[4/3] img-placeholder">
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 space-y-2">
        <div className="h-5 w-2/3 rounded bg-cream-50/50" />
        <div className="h-3 w-1/2 rounded bg-cream-50/40" />
      </div>
    </div>
  );
}
