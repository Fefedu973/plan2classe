import type { Metadata } from "next";

import { PublicClassroomForm } from "@/components/public/public-classroom-form";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

type PublicFormPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PublicFormPage({ params }: PublicFormPageProps) {
  const { slug } = await params;

  return <PublicClassroomForm slug={slug} />;
}
