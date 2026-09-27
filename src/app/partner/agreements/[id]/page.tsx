import { AgreementDetailView } from "@/components/partner/views/AgreementViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgreementDetailView id={id} />;
}
