import { SurveysView } from "@/components/portal/views/SurveyViews";
import { filtersFromParams } from "@/lib/services/filterModel";

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <SurveysView initialFilters={filtersFromParams(sp)} initialTab={one(sp.tab)} />;
}
