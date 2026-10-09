import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

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
    default: "FloodFlow — Check a flooded road before you cross",
    template: "%s · FloodFlow",
  },
  description:
    "FloodFlow shows your location on a map, keeps a local preview of a flood photo with vehicle details, and prepares it for a future risk assessment. No login needed.",
  applicationName: "FloodFlow",
  openGraph: {
    title: "FloodFlow — Check a flooded road before you cross",
    description:
      "Add a flood photo, mark its location, and note your vehicle. Assessment and shared reports arrive in a later update.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EAF0F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1424" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
