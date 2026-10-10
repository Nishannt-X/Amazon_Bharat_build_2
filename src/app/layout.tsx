import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import "./report-experience.css";
import { THEME_INIT_SCRIPT } from "../lib/theme-init";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FloodFlow — Waterlogging context for your journey",
    template: "%s · FloodFlow",
  },
  description:
    "Browse reported waterlogging, compare journeys, and capture an on-site report with your current GPS position and vehicle context.",
  applicationName: "FloodFlow",
  openGraph: {
    title: "FloodFlow — Waterlogging context for your journey",
    description:
      "Explore the waterlogging map, compare road routes, and report conditions at your current location.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Light by default; the inline theme script updates this for a saved dark choice.
  themeColor: "#f7f5ef",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-ff-theme="light" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body>{children}</body>
    </html>
  );
}
