import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./design-preview.css";
import DesignPreviewClient from "./DesignPreviewClient";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--dp-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--dp-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Design preview",
  description:
    "A separate visual proposal for FloodFlow. The current homepage is unchanged; nothing here is shared or assessed.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Separate review route. Fonts are scoped to this route via CSS variables
 * so the homepage keeps Geist. No globals.css, layout, or production
 * component is modified by this route.
 */
export default function DesignPreviewPage() {
  return (
    <div className={`${plexSans.variable} ${plexMono.variable}`}>
      <DesignPreviewClient />
    </div>
  );
}
