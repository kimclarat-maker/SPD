import { Suspense } from "react";
import { SurveyResponseView } from "@/components/field/views/SurveyViews";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <SurveyResponseView />
    </Suspense>
  );
}
