import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Finance Hub | Portfolio Tracker",
  description:
    "Track investment purchases and sales with live portfolio valuation in CAD.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
