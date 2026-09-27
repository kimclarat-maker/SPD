import { SurveyResponseView } from "@/components/partner/views/SurveyViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SurveyResponseView id={id} />;
}
