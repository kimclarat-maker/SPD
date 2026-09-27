import { Suspense } from "react";
import { SyncView } from "@/components/field/views/SyncView";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <SyncView />
    </Suspense>
  );
}
