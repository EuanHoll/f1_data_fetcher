import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Pace Lab",
  description: "Self-hosted F1 analytics web platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
