import type { Metadata } from "next";
import { SearchScreen } from "@/components/SearchScreen";

export const metadata: Metadata = { title: "Search · Reading Log" };

export default function SearchPage() {
  return <SearchScreen />;
}
