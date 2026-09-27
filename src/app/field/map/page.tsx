import { Suspense } from "react";
import { MapView } from "@/components/field/views/MapView";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <MapView />
    </Suspense>
  );
}
