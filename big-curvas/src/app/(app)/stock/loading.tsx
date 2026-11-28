import { Skeleton, SkeletonRows, SkeletonScreen } from "@/components/ui/skeleton";

export default function StockLoading() {
  return (
    <SkeletonScreen label="Cargando stock…">
      <Skeleton className="h-9 w-28" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <Skeleton className="h-10 w-full max-w-md rounded-full" />
      <SkeletonRows rows={8} />
    </SkeletonScreen>
  );
}
