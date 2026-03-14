import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-provider";
import { Roboto_Condensed, Fira_Code } from "next/font/google";
import "./globals.css";

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  variable: "--font-heading"
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "F1 Pace Lab",
  description: "Self-hosted F1 analytics web platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${robotoCondensed.variable} ${firaCode.variable}`}>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
