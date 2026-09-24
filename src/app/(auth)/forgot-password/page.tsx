import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.forgot.title") };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
