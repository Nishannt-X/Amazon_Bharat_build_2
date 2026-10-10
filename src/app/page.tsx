import type { Metadata } from "next";
import LandingPage from "../components/landing/LandingPage";

export const metadata: Metadata = {
  title: "FloodFlow — When roads flood, context matters",
  description:
    "Bring the photo, the place, and your vehicle together. Explore FloodFlow and create a local road report with no account needed.",
};

export default function HomePage() {
  return <LandingPage />;
}
