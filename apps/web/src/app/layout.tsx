import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Plan2Classe — des plans justes, calculés autrement",
    template: "%s · Plan2Classe",
  },
  description:
    "Créez une salle, recueillez les préférences et calculez un plan de classe équitable avec un solveur exact.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001"),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
