import { FieldReportsListView } from "@/components/portal/views/FieldReportViews";
import { filtersFromParams } from "@/lib/services/filterModel";

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <FieldReportsListView initialFilters={filtersFromParams(sp)} initialStatus={one(sp.status)} />;
}
