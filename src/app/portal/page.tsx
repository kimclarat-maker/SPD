import { DashboardView } from "@/components/portal/views/DashboardView";
import { filtersFromParams } from "@/lib/services/filterModel";

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <DashboardView initialFilters={filtersFromParams(sp)} initialAttention={one(sp.attention)} />;
}
