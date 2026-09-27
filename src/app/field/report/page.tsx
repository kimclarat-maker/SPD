import { Suspense } from "react";
import { ReportView } from "@/components/field/views/ReportViews";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <ReportView />
    </Suspense>
  );
}
