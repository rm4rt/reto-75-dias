import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import SwRegister from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reto 75 días",
  description: "App del reto 75 días",
  manifest: "/manifest.json",
  themeColor: "#0a0a0a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Reto75",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <ClerkProvider>{children}</ClerkProvider>
        <SwRegister />
      </body>
    </html>
  );
}
