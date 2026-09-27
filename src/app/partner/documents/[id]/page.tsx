import { DocumentDetailView } from "@/components/partner/views/DocumentViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentDetailView id={id} />;
}
