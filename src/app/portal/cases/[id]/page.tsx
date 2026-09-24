import { CaseDetailView } from "@/components/portal/views/CaseViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetailView id={id} />;
}
