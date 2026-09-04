import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LibraryProvider } from "@/components/LibraryProvider";
import { Masthead } from "@/components/Masthead";
import { TabBar } from "@/components/TabBar";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "Reading Log",
  description:
    "A personal reading tracker: what you are reading, what you have finished, and the streak you are keeping.",
  applicationName: "Reading Log",
  appleWebApp: {
    capable: true,
    title: "Reading Log",
    // Translucent lets the navy masthead run under the iOS status bar.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Home-screen launches should not be indexed or shared as a product page.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1B2A41",
  width: "device-width",
  initialScale: 1,
  // The app is a fixed-width column; zooming it in standalone mode only
  // breaks the fixed masthead and tab bar.
  maximumScale: 1,
  userScalable: false,
  // Required for env(safe-area-inset-*) to report real values on iPhone.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <LibraryProvider>
          <Masthead />
          {/* Padding clears the fixed masthead (48px + inset) and tab bar. */}
          <main className="mx-auto max-w-md pt-[calc(3rem+env(safe-area-inset-top,0px))] pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
            {children}
          </main>
          <TabBar />
        </LibraryProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
