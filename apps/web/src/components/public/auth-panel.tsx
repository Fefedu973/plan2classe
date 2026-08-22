"use client";

import { Alert, AlertDescription, AlertTitle } from "@plan2classe-app/ui/components/alert";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plan2classe-app/ui/components/card";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthMode = "signin" | "signup";

export function AuthPanel({ initialMode }: { initialMode: AuthMode }) {
  const router = useRouter();
  const formId = useId();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === "signup";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    window.history.replaceState(null, "", nextMode === "signup" ? "/login?mode=signup" : "/login");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Saisissez une adresse e-mail valide.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (isSignUp && cleanName.length < 2) {
      setError("Indiquez votre nom ou le nom de votre établissement.");
      return;
    }

    setPending(true);
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ email: cleanEmail, password, name: cleanName })
        : await authClient.signIn.email({ email: cleanEmail, password });

      if (result.error) {
        setError(
          result.error.message ??
            (isSignUp
              ? "Ce compte n’a pas pu être créé. Vérifiez les informations saisies."
              : "Connexion impossible. Vérifiez votre e-mail et votre mot de passe."),
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Le service est momentanément indisponible. Réessayez dans quelques instants.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-0 overflow-y-auto bg-muted/25">
      <div className="mx-auto grid min-h-full max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between">
          <div
            aria-hidden="true"
            className="absolute -right-28 -top-28 size-80 rounded-full border border-background/15"
          />
          <div
            aria-hidden="true"
            className="absolute -right-14 -top-14 size-52 rounded-full border border-background/15"
          />

          <Link href="/" className="relative flex w-fit items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-background text-foreground">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            Plan2Classe
          </Link>

          <div className="relative max-w-lg space-y-6">
            <Badge className="border-background/20 bg-background/10 text-background">
              Pensé pour les équipes pédagogiques
            </Badge>
            <h1 className="text-balance text-4xl font-semibold tracking-tight xl:text-5xl">
              Un plan juste, lisible et réellement applicable.
            </h1>
            <p className="max-w-md text-base leading-7 text-background/70">
              Recueillez les préférences, posez vos contraintes et laissez le moteur chercher la
              meilleure répartition possible.
            </p>
          </div>

          <div className="relative grid gap-3 text-sm text-background/75">
            {[
              "Données et calculs hébergés chez vous",
              "Formulaires élèves sans compte",
              "Plans exportables et décisions explicables",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="grid size-5 place-items-center rounded-full bg-background/10">
                  <Check className="size-3" aria-hidden="true" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md space-y-5">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour à l’accueil
            </Link>

            <Card className="shadow-sm">
              <CardHeader className="gap-2 px-6 pt-2 sm:px-7">
                <div className="mb-2 grid size-10 place-items-center rounded-xl border bg-muted/50">
                  <LockKeyhole className="size-4" aria-hidden="true" />
                </div>
                <CardTitle className="text-2xl tracking-tight">
                  {isSignUp ? "Créer votre espace" : "Retrouver votre espace"}
                </CardTitle>
                <CardDescription className="leading-6">
                  {isSignUp
                    ? "Un e-mail, un mot de passe, et vous pouvez préparer votre première classe."
                    : "Connectez-vous pour gérer vos classes et leurs formulaires."}
                </CardDescription>
              </CardHeader>

              <CardContent className="px-6 pb-2 sm:px-7">
                <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                  {isSignUp ? (
                    <div className="space-y-2">
                      <Label htmlFor={`${formId}-name`}>Votre nom</Label>
                      <Input
                        id={`${formId}-name`}
                        name="name"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Marie Dupont"
                        disabled={pending}
                        required
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor={`${formId}-email`}>Adresse e-mail</Label>
                    <Input
                      id={`${formId}-email`}
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="vous@etablissement.fr"
                      disabled={pending}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`${formId}-password`}>Mot de passe</Label>
                      <span className="text-xs text-muted-foreground">8 caractères minimum</span>
                    </div>
                    <div className="relative">
                      <Input
                        id={`${formId}-password`}
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="pr-10"
                        disabled={pending}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error ? (
                    <Alert variant="destructive" aria-live="polite">
                      <CircleAlert aria-hidden="true" />
                      <AlertTitle>Impossible de continuer</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}

                  <Button type="submit" size="lg" className="w-full" disabled={pending}>
                    {pending
                      ? "Un instant…"
                      : isSignUp
                        ? "Créer mon espace"
                        : "Se connecter"}
                    {!pending ? <ArrowRight data-icon="inline-end" aria-hidden="true" /> : null}
                  </Button>
                </form>

                <div className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
                  {isSignUp ? "Vous avez déjà un espace ?" : "Première visite ?"}{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    onClick={() => switchMode(isSignUp ? "signin" : "signup")}
                  >
                    {isSignUp ? "Se connecter" : "Créer un compte"}
                  </button>
                </div>
              </CardContent>
            </Card>

            <p className="px-4 text-center text-xs leading-5 text-muted-foreground">
              Aucun service d’e-mail tiers n’est nécessaire : votre adresse sert uniquement à
              identifier votre compte administrateur.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
