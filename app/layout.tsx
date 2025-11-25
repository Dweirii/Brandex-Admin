import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { ModalProvider } from "@/providers/modal-provider";
import { ToasterProvider } from "@/providers/toast-provider";

const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"], // Reduced weights for faster load
  display: "swap", // Better font loading performance
  preload: true,
});


export const metadata: Metadata = {
  title: "Dashboard",
  description: "An admin dashboard for Brandex",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  robots: {
    index: false,
    follow: false,
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full w-full">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="dns-prefetch" href="https://utfs.io" />
          <link rel="dns-prefetch" href="https://brandex-cdn.b-cdn.net" />
        </head>
        <body
          className={`${robotoCondensed.variable} font-sans min-h-screen w-full antialiased bg-[#141517] text-foreground flex flex-col`}
        >
        <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
          <ModalProvider />
          <ToasterProvider />
          {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
