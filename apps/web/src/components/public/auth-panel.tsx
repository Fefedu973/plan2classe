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
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Brand } from "@/components/brand";
import { ModeToggle } from "@/components/mode-toggle";
import { authClient } from "@/lib/auth-client";

type AuthMode = "signin" | "signup";
type FieldName = "name" | "username" | "password";
type FormError = { field: FieldName | null; message: string };

const highlights = [
  "Données et calculs hébergés chez vous",
  "Formulaires élèves sans compte",
  "Plans exportables et décisions explicables",
];

function authErrorMessage(
  error: { code?: string; message?: string; status?: number },
  isSignUp: boolean,
): FormError {
  if (error.status === 429) {
    return {
      field: null,
      message: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
    };
  }
  if (error.code === "USERNAME_IS_ALREADY_TAKEN") {
    return { field: "username", message: "Cet identifiant est déjà utilisé." };
  }
  if (error.code === "INVALID_USERNAME_OR_PASSWORD") {
    return { field: "username", message: "Identifiant ou mot de passe incorrect." };
  }
  if (error.code === "USERNAME_TOO_SHORT" || error.code === "USERNAME_TOO_LONG") {
    return { field: "username", message: "L’identifiant doit contenir entre 3 et 30 caractères." };
  }
  if (error.code === "INVALID_USERNAME") {
    return {
      field: "username",
      message: "Utilisez uniquement des lettres, chiffres, points ou tirets bas.",
    };
  }
  return {
    field: null,
    message:
      error.message ??
      (isSignUp
        ? "Ce compte n’a pas pu être créé. Vérifiez les informations saisies."
        : "Connexion impossible. Vérifiez votre identifiant et votre mot de passe."),
  };
}

export function AuthPanel({ initialMode }: { initialMode: AuthMode }) {
  const router = useRouter();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const isSignUp = mode === "signup";

  function fail(next: FormError) {
    setError(next);
    const target =
      next.field === "name" ? nameRef : next.field === "password" ? passwordRef : usernameRef;
    if (next.field) target.current?.focus();
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    window.history.replaceState(null, "", nextMode === "signup" ? "/login?mode=signup" : "/login");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();
    if (isSignUp && cleanName.length < 2) {
      fail({ field: "name", message: "Indiquez votre nom ou le nom de votre établissement." });
      return;
    }
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(cleanUsername)) {
      fail({
        field: "username",
        message: "L’identifiant doit contenir 3 à 30 lettres, chiffres, points ou tirets bas.",
      });
      return;
    }
    if (password.length < 8) {
      fail({ field: "password", message: "Le mot de passe doit contenir au moins 8 caractères." });
      return;
    }

    setPending(true);
    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            // Better Auth exige ce champ dans son protocole. Le serveur le
            // remplace systématiquement par une adresse locale non distribuable.
            email: "local-account@plan2classe.invalid",
            password,
            name: cleanName,
            username: cleanUsername,
          })
        : await authClient.signIn.username({ username: cleanUsername, password });

      if (result.error) {
        fail(authErrorMessage(result.error, isSignUp));
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError({
        field: null,
        message: "Le service est momentanément indisponible. Réessayez dans quelques instants.",
      });
    } finally {
      setPending(false);
    }
  }

  const invalid = (field: FieldName) => (error?.field === field ? true : undefined);

  return (
    <main className="min-h-svh bg-muted/25">
      <div className="mx-auto grid min-h-svh max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between">
          <div
            aria-hidden="true"
            className="absolute -top-28 -right-28 size-80 rounded-full border border-background/15"
          />
          <div
            aria-hidden="true"
            className="absolute -top-14 -right-14 size-52 rounded-full border border-background/15"
          />

          <Link
            href="/"
            className="relative flex w-fit items-center gap-2.5 font-semibold tracking-tight"
          >
            <span className="grid size-8 grid-cols-2 gap-0.5 rounded-lg bg-background p-1.5">
              <span className="rounded-[2px] bg-foreground" />
              <span className="rounded-[2px] bg-foreground/70" />
              <span className="rounded-[2px] bg-foreground/70" />
              <span className="rounded-[2px] bg-foreground" />
            </span>
            Plan2Classe
          </Link>

          <div className="relative max-w-lg space-y-6">
            <Badge className="border-background/20 bg-background/10 text-background">
              Pensé pour les équipes pédagogiques
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance xl:text-5xl">
              Un plan juste, lisible et réellement applicable.
            </h1>
            <p className="max-w-md text-base leading-7 text-background/70">
              Recueillez les préférences, posez vos contraintes et laissez le moteur chercher la
              meilleure répartition possible.
            </p>
          </div>

          <ul className="relative grid gap-3 text-sm text-background/75">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-background/10">
                  <Check className="size-3" aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col px-4 py-6 sm:px-8 lg:px-12">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour à l’accueil
            </Link>
            <ModeToggle />
          </div>

          <div className="flex flex-1 items-center justify-center py-8">
            <div className="w-full max-w-md space-y-5">
              <Brand className="lg:hidden" />

              <Card className="shadow-sm">
                <CardHeader className="gap-2">
                  <div className="mb-1 grid size-10 place-items-center rounded-xl border bg-muted/50">
                    <LockKeyhole className="size-4" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-2xl tracking-tight">
                    {isSignUp ? "Créer votre espace" : "Retrouver votre espace"}
                  </CardTitle>
                  <CardDescription className="leading-6">
                    {isSignUp
                      ? "Choisissez un identifiant local et créez votre première classe."
                      : "Connectez-vous pour gérer vos classes et leurs formulaires."}
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                    {isSignUp ? (
                      <div className="space-y-2">
                        <Label htmlFor={`${formId}-name`}>Votre nom</Label>
                        <Input
                          id={`${formId}-name`}
                          ref={nameRef}
                          name="name"
                          autoComplete="name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Marie Dupont"
                          disabled={pending}
                          aria-invalid={invalid("name")}
                          required
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor={`${formId}-username`}>Identifiant</Label>
                      <Input
                        id={`${formId}-username`}
                        ref={usernameRef}
                        name="username"
                        type="text"
                        inputMode="text"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoFocus={!isSignUp}
                        spellCheck={false}
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="marie.dupont"
                        disabled={pending}
                        aria-invalid={invalid("username")}
                        aria-describedby={`${formId}-username-hint`}
                        required
                        minLength={3}
                        maxLength={30}
                      />
                      <p id={`${formId}-username-hint`} className="text-xs text-muted-foreground">
                        3 à 30 caractères : lettres, chiffres, point ou tiret bas.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={`${formId}-password`}>Mot de passe</Label>
                        <span className="text-xs text-muted-foreground">8 caractères minimum</span>
                      </div>
                      <div className="relative">
                        <Input
                          id={`${formId}-password`}
                          ref={passwordRef}
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={isSignUp ? "new-password" : "current-password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          onKeyUp={(event) =>
                            setCapsLock(event.getModifierState?.("CapsLock") ?? false)
                          }
                          onBlur={() => setCapsLock(false)}
                          className="pr-10"
                          disabled={pending}
                          aria-invalid={invalid("password")}
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          onClick={() => setShowPassword((visible) => !visible)}
                          aria-label={
                            showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                          }
                          aria-pressed={showPassword}
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" aria-hidden="true" />
                          ) : (
                            <Eye className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      {capsLock ? (
                        <p className="text-xs text-warning" aria-live="polite">
                          La touche Verr. Maj est activée.
                        </p>
                      ) : null}
                    </div>

                    {error ? (
                      <Alert variant="destructive" aria-live="polite">
                        <CircleAlert aria-hidden="true" />
                        <AlertTitle>Impossible de continuer</AlertTitle>
                        <AlertDescription>{error.message}</AlertDescription>
                      </Alert>
                    ) : null}

                    <Button type="submit" size="lg" className="w-full" disabled={pending}>
                      {pending ? (
                        <>
                          <LoaderCircle className="animate-spin" aria-hidden="true" />
                          Un instant…
                        </>
                      ) : (
                        <>
                          {isSignUp ? "Créer mon espace" : "Se connecter"}
                          <ArrowRight data-icon="inline-end" aria-hidden="true" />
                        </>
                      )}
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
                Aucun e-mail n’est demandé ou envoyé. Il n’existe donc pas de récupération par
                e-mail : conservez votre identifiant et votre mot de passe dans un gestionnaire.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
