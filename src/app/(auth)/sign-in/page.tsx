import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { SignInForm } from "./SignInForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.signIn.title") };
}

export default function SignInPage() {
  return <SignInForm />;
}
