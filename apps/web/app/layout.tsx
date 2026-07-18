import "./globals.css";
import { AppShell } from "./lib/AppShell";

export const metadata = {
  title: "RustPilot",
  description: "Lokale Rust Dedicated Server manager"
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
