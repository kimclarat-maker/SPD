import { PartnerDetailView } from "@/components/portal/views/PartnerViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartnerDetailView id={id} />;
}
