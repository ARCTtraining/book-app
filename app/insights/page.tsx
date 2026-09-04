import type { Metadata } from "next";
import { InsightsScreen } from "@/components/InsightsScreen";

export const metadata: Metadata = { title: "Insights · Reading Log" };

export default function InsightsPage() {
  return <InsightsScreen />;
}
