import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Profit Leak Attorney",
  description: "Find out where your business is bleeding money.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn(inter.className, "bg-slate-50 text-slate-900 antialiased min-h-screen")}>
        <nav className="border-b bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-50">
          <div className="font-bold text-xl tracking-tight text-slate-900">Profit Leak Attorney</div>
          <div className="text-sm font-medium text-slate-500">BETA</div>
        </nav>

        {/* IMPORTANT: remove max-w constraint here. Pages control their own width. */}
        <main className="min-h-[calc(100vh-64px)]">{children}</main>
      </body>
    </html>
  );
}
