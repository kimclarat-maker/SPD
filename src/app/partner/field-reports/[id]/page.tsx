import { FieldReportDetailView } from "@/components/partner/views/FieldReportViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FieldReportDetailView id={id} />;
}
