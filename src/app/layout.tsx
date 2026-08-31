import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "College OS",
  description: "Everything you need to survive college, in one app.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
