import type { Metadata } from "next";
import LandingPage from "../components/landing/LandingPage";

export const metadata: Metadata = {
  title: "FloodFlow — Waterlogging context for your journey",
  description:
    "Explore reported waterlogging, compare road routes, and report an on-site photo tied to your current GPS location.",
};

export default function HomePage() {
  return <LandingPage />;
}
