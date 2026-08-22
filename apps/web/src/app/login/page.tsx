import { AuthPanel } from "@/components/public/auth-panel";

type LoginPageProps = {
  searchParams: Promise<{ mode?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { mode } = await searchParams;
  const requestedMode = Array.isArray(mode) ? mode[0] : mode;

  return <AuthPanel initialMode={requestedMode === "signup" ? "signup" : "signin"} />;
}
