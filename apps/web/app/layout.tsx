import type { Metadata, Viewport } from "next";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { authClient } from "@/lib/auth/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "work-tracker",
  description: "Screen-capture work logger with agentic RAG.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Cast: beta @neondatabase/auth-ui types expect org hooks that
            createAuthClient doesn't expose. Runtime works either way. */}
        <NeonAuthUIProvider authClient={authClient as never}>
          {children}
        </NeonAuthUIProvider>
      </body>
    </html>
  );
}
