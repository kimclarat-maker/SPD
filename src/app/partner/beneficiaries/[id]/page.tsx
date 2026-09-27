import { AssistanceDetailView } from "@/components/partner/views/BeneficiaryViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssistanceDetailView id={id} />;
}
