"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Inicio", icon: "🏠" },
  { href: "/progress", label: "Progreso", icon: "📸" },
  { href: "/tracking", label: "Seguimiento", icon: "📊" },
  { href: "/profile", label: "Perfil", icon: "👤" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-neutral-950/95 backdrop-blur">
      <div className="mx-auto grid h-20 w-full max-w-md grid-cols-4">
        {items.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 text-xs transition ${
                isActive ? "text-white" : "text-white/45"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}