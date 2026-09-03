import type { Metadata, Viewport } from "next";
import { PwaRegistrationProvider } from "@/features/pwa/PwaRegistrationProvider";
import "./globals.css";

const description = "Read EPUB, PDF and CBZ books from local folders or private browser storage.";

export const metadata: Metadata = {
  applicationName: "Local Ebook Reader",
  title: "Local Ebook Reader",
  description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ebook Reader" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#1f6b4f", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistrationProvider>{children}</PwaRegistrationProvider>
      </body>
    </html>
  );
}
