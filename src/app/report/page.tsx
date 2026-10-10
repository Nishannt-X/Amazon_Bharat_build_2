import type { Metadata } from "next";
import ReportScreen from "../../components/ReportScreen";

export const metadata: Metadata = {
  title: "Create a local flood report",
  description: "Mark a flood location, add a photo, and enter vehicle details. This prototype keeps your report in browser memory; assessment is not yet available.",
};

export default function ReportPage() {
  return <ReportScreen />;
}
