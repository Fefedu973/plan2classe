import Dashboard from "./dashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const query = await searchParams;
  return <Dashboard initialCreateOpen={query.create === "1"} />;
}
