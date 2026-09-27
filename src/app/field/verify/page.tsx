import { Suspense } from "react";
import { VerifyView } from "@/components/field/views/BeneficiaryViews";

// Record ids travel in the query string and are read in the browser, so one cached page serves every record offline.
export default function Page() {
  return (
    <Suspense>
      <VerifyView />
    </Suspense>
  );
}
