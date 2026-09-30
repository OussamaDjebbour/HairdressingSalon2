export function ServiceCardSkeleton() {
  return (
    <div className="flex flex-col bg-white rounded-2xl border border-cream-200 overflow-hidden">
      <div className="aspect-[16/11] img-placeholder" />
      <div className="p-6 space-y-3">
        <div className="h-5 w-2/3 rounded img-placeholder" />
        <div className="h-3 w-full rounded img-placeholder" />
        <div className="h-3 w-4/5 rounded img-placeholder" />
        <div className="h-px bg-cream-200 my-2" />
        <div className="h-6 w-1/3 rounded img-placeholder" />
      </div>
    </div>
  );
}
