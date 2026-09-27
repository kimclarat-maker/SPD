import { FieldReportFormView } from "@/components/partner/views/FieldReportViews";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <FieldReportFormView initialIntervention={one(sp.intervention)} />;
}
