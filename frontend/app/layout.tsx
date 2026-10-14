import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Maintenance AI",
  description:
    "Industrial decision support for CNC maintenance, policy evidence and human review",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-body">{children}</body>
    </html>
  );
}
