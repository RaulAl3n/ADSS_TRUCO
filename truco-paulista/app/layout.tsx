import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Truco Paulista",
  description: "Truco Paulista contra adversários controlados pelo computador.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2a0812" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;800;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
