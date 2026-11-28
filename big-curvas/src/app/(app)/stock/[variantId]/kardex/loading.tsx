import { Skeleton, SkeletonRows, SkeletonScreen } from "@/components/ui/skeleton";

export default function KardexLoading() {
  return (
    <SkeletonScreen label="Cargando kardex…">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <SkeletonRows rows={6} />
    </SkeletonScreen>
  );
}
