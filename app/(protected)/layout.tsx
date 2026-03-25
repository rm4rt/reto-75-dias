import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AppHeader from "@/components/app-header";
import MobileBottomNav from "@/components/mobile-bottom-nav";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-md flex-col px-4 pb-24 pt-4">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}

