import { Skeleton } from "@/components/ui/skeleton";

/** 2a loading: skeletons in the hairline tone, shaped like what they replace. */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-[26px]">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-8 w-52 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-md" />
      </div>
      <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
