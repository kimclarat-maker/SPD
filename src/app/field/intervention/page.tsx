import { Suspense } from "react";
import { InterventionView } from "@/components/field/views/WorkViews";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <InterventionView />
    </Suspense>
  );
}
