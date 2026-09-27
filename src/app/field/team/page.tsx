import { Suspense } from "react";
import { TeamView } from "@/components/field/views/TeamView";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <TeamView />
    </Suspense>
  );
}
