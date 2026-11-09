import type { Metadata } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { MeProvider } from "@/lib/me";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });

const SITE = "https://lunasproject.site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Lunas — AI-verified escrow for freelancers, powered by PayPal",
  description:
    "AI-verified escrow for freelancers and their clients, powered by PayPal. Get paid. Stamp it. Done.",
  alternates: { canonical: `${SITE}/` },
  openGraph: {
    type: "website",
    siteName: "Lunas",
    url: `${SITE}/`,
    title: "Lunas — AI-verified escrow for freelancers, powered by PayPal",
    description:
      "AI-verified escrow for freelancers and their clients, powered by PayPal. Get paid. Stamp it. Done.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lunas — AI-verified escrow for freelancers, powered by PayPal",
    description:
      "AI-verified escrow for freelancers and their clients, powered by PayPal. Get paid. Stamp it. Done.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable}`}>
      <body>
        <ThemeProvider>
          <MeProvider>
            <I18nProvider>{children}</I18nProvider>
          </MeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
