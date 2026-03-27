"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/fasting",  label: "Inicio",      icon: "🏠" },
  { href: "/ai",       label: "IA",          icon: "✦" },
  { href: "/progress", label: "Tu progreso", icon: "📸" },
  { href: "/tracking", label: "Historial",   icon: "📊" },
  { href: "/profile",  label: "Perfil",      icon: "👤" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-neutral-950/95 backdrop-blur">
      <div className="mx-auto grid h-20 w-full max-w-md grid-cols-5">
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