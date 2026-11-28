import { Skeleton, SkeletonRows, SkeletonScreen } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <SkeletonScreen label="Cargando reportes…" className="space-y-5">
      <Skeleton className="h-9 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="col-span-2 h-28 rounded-3xl sm:col-span-1" />
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-28 rounded-3xl" />
      </div>
      <Skeleton className="h-10 w-full max-w-2xl rounded-full" />
      <SkeletonRows rows={6} />
    </SkeletonScreen>
  );
}
