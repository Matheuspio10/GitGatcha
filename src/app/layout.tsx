import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { getCurrentUser } from "@/lib/session";
import { NextAuthProvider } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GitGatcha - Dev Card Game",
  description: "Collect developers, build your deck, rule the repository.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-50 min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black`}>
        <NextAuthProvider>
          <Navbar username={user?.username || ''} currency={user?.currency || 0} />
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
        </NextAuthProvider>
      </body>
    </html>
  );
}
