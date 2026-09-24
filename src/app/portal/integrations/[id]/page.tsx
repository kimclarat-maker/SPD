import { IntegrationDetailView } from "@/components/portal/views/IntegrationViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IntegrationDetailView id={id} />;
}
