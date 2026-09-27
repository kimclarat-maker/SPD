import { SurveyDetailView } from "@/components/partner/views/SurveyViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SurveyDetailView id={id} />;
}
