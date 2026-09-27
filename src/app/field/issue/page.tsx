import { Suspense } from "react";
import { IssueView } from "@/components/field/views/IssueViews";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <IssueView />
    </Suspense>
  );
}
