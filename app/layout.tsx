import type { Metadata } from "next";
import "./globals.css";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "FACILITATE 2027 — Session Assessment",
  description: "Private assessment tool for IAF Europe Region Conference 2027",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("fa27-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
