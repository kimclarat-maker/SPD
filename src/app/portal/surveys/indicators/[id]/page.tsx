import { IndicatorDetailView } from "@/components/portal/views/SurveyViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IndicatorDetailView id={id} />;
}
