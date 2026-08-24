import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSw } from "./register-sw";
import { LocaleProvider } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const metadata: Metadata = {
  title: "Today's Record",
  description: "A daily care record for older adults",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Today's Record" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // no pinch surprises for elderly users; text is already large
  themeColor: "#fffdf8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>
          <RegisterSw />
          <div className="fixed right-2 top-2 z-50 print:hidden">
            <LanguageSwitcher />
          </div>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
