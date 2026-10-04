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

export const metadata: Metadata = {
  title: "Lunas — Get paid. Stamp it. Done.",
  description: "AI-verified escrow for freelancers and their clients, powered by PayPal.",
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
