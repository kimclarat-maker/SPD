import { BeneficiariesView } from "@/components/portal/views/BeneficiaryViews";
import { filtersFromParams } from "@/lib/services/filterModel";

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <BeneficiariesView initialFilters={filtersFromParams(sp)} initialTab={one(sp.tab)} initialStatus={one(sp.status)} />;
}
