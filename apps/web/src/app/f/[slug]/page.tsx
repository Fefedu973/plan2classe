import { PublicClassroomForm } from "@/components/public/public-classroom-form";

type PublicFormPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PublicFormPage({ params }: PublicFormPageProps) {
  const { slug } = await params;

  return <PublicClassroomForm slug={slug} />;
}
