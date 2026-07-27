import "./globals.css";
import { AppShell } from "./lib/AppShell";

export const metadata = {
  title: "RustPilot",
  description: "Lokale Rust Dedicated Server manager",
  icons: {
    icon: [
      { url: "/brand/logo-small.svg", type: "image/svg+xml" },
      { url: "/brand/logo.ico", sizes: "any" }
    ],
    shortcut: "/brand/logo.ico",
    apple: "/brand/logo-small.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
