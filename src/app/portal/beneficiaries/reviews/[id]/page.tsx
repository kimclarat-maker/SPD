import { ReviewDetailView } from "@/components/portal/views/BeneficiaryViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewDetailView id={id} />;
}
