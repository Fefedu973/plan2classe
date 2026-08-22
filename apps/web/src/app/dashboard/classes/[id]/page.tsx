import { ClassroomWorkspace } from "@/components/classroom/classroom-workspace";

export default async function ClassroomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ClassroomWorkspace classroomId={id} />;
}
