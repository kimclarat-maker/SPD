import { ProposalDetailView } from "@/components/partner/views/ProposalViews";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  return <ProposalDetailView id={id} initialTab={one(sp.tab)} />;
}
