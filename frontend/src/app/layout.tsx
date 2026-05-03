import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlético Intelligence",
  description:
    "AI-powered single-camera offside and goal-line incident review for grassroots soccer leagues.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-bg text-text">{children}</body>
    </html>
  );
}
