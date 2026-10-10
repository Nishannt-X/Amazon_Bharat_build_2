import type { Metadata } from "next";
import ReportScreen from "../../components/ReportScreen";

export const metadata: Metadata = {
  title: "Report waterlogging at your location",
  description: "Capture an on-site photo bound to a fresh GPS position and add your vehicle details.",
};

export default function ReportPage() {
  return <ReportScreen initialReporting />;
}
