import { ExceptionDetailView } from "@/components/portal/views/ExceptionViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExceptionDetailView id={id} />;
}
