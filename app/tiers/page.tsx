import type { Metadata } from "next";
import { TierScreen } from "@/components/TierScreen";

export const metadata: Metadata = { title: "Tiers · Reading Log" };

export default function TiersPage() {
  return <TierScreen />;
}
