import { brandFontVariables } from "@/app/fonts";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import styles from "./home.module.css";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${brandFontVariables} ${styles.landing}`}>
      <LandingHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <LandingFooter />
    </div>
  );
}
