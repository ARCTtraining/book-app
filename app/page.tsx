import type { Metadata } from "next";
import { ShelfScreen } from "@/components/ShelfScreen";

export const metadata: Metadata = { title: "Shelf · Reading Log" };

export default function ShelfPage() {
  return <ShelfScreen />;
}
