// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Profit Leak Attorney",
  description: "Find out where your business is bleeding money.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 text-zinc-900 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
