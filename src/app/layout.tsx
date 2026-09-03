import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Leaf Reader",
  description: "Read EPUB, PDF, and CBZ files privately in your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
