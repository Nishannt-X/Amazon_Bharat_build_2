import type { Metadata } from "next";
import ReportScreen from "../components/ReportScreen";

export const metadata: Metadata = {
  title: "FloodFlow — Check a flooded road before you cross",
  description:
    "Mark the spot on a map, add a flood photo and vehicle details. Photos and details stay on this device as a local preview; place search uses Photon.",
};

export default function HomePage() {
  return <ReportScreen />;
}
