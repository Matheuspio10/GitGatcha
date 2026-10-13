import type { Metadata, Viewport } from "next";
import { Unbounded, Chakra_Petch, JetBrains_Mono, Caveat } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { getCurrentUser } from "@/lib/session";
import { NextAuthProvider } from "@/components/Providers";
import { LevelUpModal } from "@/components/LevelUpModal";
import { SetupProfileModal } from "@/components/SetupProfileModal";
import { WelcomeModal } from "@/components/WelcomeModal";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { buildEarnGuide } from "@/lib/earnGuide";
import { getPackById } from "@/lib/packDefinitions";
import { STARTER_PACK_ID } from "@/lib/onboarding";
import { siteUrl } from "@/lib/siteUrl";

// Display (logo, headings) · UI (body, card names) · Mono (numbers, hashes) · Script (Signature autograph)
const unbounded = Unbounded({ subsets: ["latin"], weight: ["600", "800"], variable: '--font-unbounded' });
const chakraPetch = Chakra_Petch({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: '--font-chakra' });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: '--font-jetbrains' });
const caveat = Caveat({ subsets: ["latin"], weight: ["700"], variable: '--font-caveat' });

export const metadata: Metadata = {
  // Absolute URLs for the og:image of the public card and player pages
  metadataBase: new URL(siteUrl()),
  title: "GitGacha - Dev Card Game",
  description: "Collect developers, build your deck, rule the repository.",
};

// No maximumScale: users must be able to pinch-zoom (WCAG 1.4.4)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className="dark">
      <body className={`${unbounded.variable} ${chakraPetch.variable} ${jetbrainsMono.variable} ${caveat.variable} font-sans app-bg text-slate-50 min-h-screen overflow-x-hidden`}>
        <NextAuthProvider>
          <Navbar username={user?.username || ''} currency={user?.currency || 0} userImage={user?.image} />
          <LevelUpModal />
          <SetupProfileModal />
          {user?.onboarding && !user.onboarding.welcomeSeen && (
            <WelcomeModal
              username={user.username}
              starterPackName={getPackById(STARTER_PACK_ID)?.name ?? 'Starter pack'}
              guestCards={user.onboarding.guestCards ?? 0}
              guide={buildEarnGuide(user.username)}
            />
          )}
          {user?.onboarding && <OnboardingChecklist />}
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
        </NextAuthProvider>
      </body>
    </html>
  );
}
