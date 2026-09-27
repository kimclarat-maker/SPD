import { Suspense } from "react";
import { AccountView } from "@/components/field/views/AccountViews";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <AccountView />
    </Suspense>
  );
}
