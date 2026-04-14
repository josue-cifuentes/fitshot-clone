import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppSessionProvider } from "./components/session-provider";
import { AppShell } from "./components/app-shell";
import { Footer } from "./components/Footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fitshot",
    template: "%s · Fitshot",
  },
  description:
    "Overlay Strava stats and routes on photos or short videos. Layout presets and Instagram feed or story export.",
  applicationName: "Fitshot",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Fitshot",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-[100dvh] min-h-dvh flex flex-col font-sans">
        <AppSessionProvider>
          <AppShell footer={<Footer />}>{children}</AppShell>
        </AppSessionProvider>
      </body>
    </html>
  );
}
