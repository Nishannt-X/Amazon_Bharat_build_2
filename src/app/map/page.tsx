import type { Metadata } from "next";
import WaterlogMapScreen from "../../components/WaterlogMapScreen";

export const metadata: Metadata = {
  title: "Waterlogging map and journeys",
  description: "Browse reported waterlogging and compare road routes with context for your vehicle.",
};

export default function MapPage() {
  return <WaterlogMapScreen />;
}
