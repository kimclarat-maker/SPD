import { InterventionDetailView } from "@/components/portal/views/InterventionViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InterventionDetailView id={id} />;
}
