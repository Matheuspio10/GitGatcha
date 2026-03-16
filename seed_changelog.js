const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Delete existing entries to avoid duplicates and ensure clean state
  await prisma.changelogEntry.deleteMany({});
  console.log('Cleared existing changelog entries.');

  const v1_1 = await prisma.changelogEntry.create({
    data: {
      version: 'v1.1.0 — March 14, 2026',
      title: 'Forge, Stamina & Battle Systems Mega Update',
      body: `### 🛠️ Forge System
Added the **Forge panel**, where you can search any developer by GitHub username or profile link and invoke their card using language fragments and BITS. 

- Accumulate fragments by opening packs or receiving duplicate cards.
- Spend fragments to **guarantee** a specific card you want. 
- Add developers to your **Wishlist** to track fragment progress for each one.

***

### 🔋 Stamina and Fatigue System
Cards now have a stamina bar that decreases after every battle. 

- Cards with low stamina suffer **ATK and DEF penalties**.
- Cards at 0 stamina become **unavailable for battle**.
- Stamina recovers automatically over time or can be instantly restored for **100 BITS**.

***

### 🏆 Leagues and Tournaments
Added 5 leagues with distinct rules: **Open**, **Common**, **Balanced**, **Diversity**, and **Legendary Only**. 

Each league has its own team composition restrictions and unique **BITS and XP reward tiers**.

***

### 🤝 Loyalty Contract System
Cards now accumulate battles over time and unlock permanent titles and stat bonuses at milestones of 10, 25, 50, 100, and 200 battles. 

Highly loyal cards gain **exclusive animated frames** visible in both the collection and during battles.

***

### ⚔️ Battle System Improvements
Fixed a bug causing battles to last over 200 rounds. 

- Added a language type advantage system.
- **Critical hits** with ATK-based chance.
- Momentum bonus for cards on **winning streaks**.
- Battle speed control with a **skip-to-result** option.

***

### 📱 UI/UX Improvements
Battle screen fully redesigned with a real-time event log, damage animations, color-transitioning HP bars, and a detailed post-battle summary. 

The site has been fully optimized for **mobile devices** with responsive navigation, adapted menus, and fixed layouts across all screens.`,
      createdAt: new Date('2026-03-14T12:00:00Z'),
    },
  });
  console.log('Created v1.1.0 changelog:', v1_1.id);

  const v1_6 = await prisma.changelogEntry.create({
    data: {
      version: 'v1.6 — March 15, 2026',
      title: 'Booster Opening Overhaul, Card Reveal Redesign, Wiki & Changelog',
      body: `### 🎆 Interactive Booster Opening
Opening a pack is no longer a passive waiting screen. You must now **rapidly click the booster** to charge it up before it explodes open. The pack reacts to every click with shaking, sparks, and energy effects that escalate as the charge builds. If the server takes longer than expected to respond, the pack enters an **Overcharged** state and holds at maximum intensity until the cards are ready — no loading spinners, no dead time.

***

### 🃏 Card Reveal Redesign
Cards are now revealed **one at a time** after the booster explodes, replicating the experience of opening a physical TCG pack. Each card enters face down and must be flipped individually by tapping or clicking it. **Common** and **Uncommon** cards flip instantly while **Rare**, **Epic**, and **Legendary** cards each have their own escalating buildup animations before the reveal. Legendary cards receive a full dramatic sequence with golden light rays, screen darkening, and a burst animation on flip. Cards are presented commons first and the highest rarity pull is always last. A full **summary screen** appears after the final card showing all pulls, new additions, and fragments earned from duplicates.

***

### 📖 Wiki
Added a dedicated **Wiki page** accessible from the main navigation. Covers everything in the game across **13 sections**: Getting Started, Cards and Rarities, Stats Explained, Language Types and Advantages, Passive Abilities, Battle System, Critical Hits and Momentum, Leagues and Tournaments, Stamina System, Loyalty Contract System, Forge System, Team Synergies, and a full Glossary. Includes a **real-time search bar** and deep links from the Arena, Forge, collection, and post-battle screens pointing directly to the relevant section.

***

### 📋 Changelog
Added a **Changelog button** to the main navigation bar. Displays a floating modal with the full update history as patch notes. New entries trigger an **unread indicator** on the button that clears once opened. Entries are collapsed by default with the most recent one expanded automatically.`,
      createdAt: new Date('2026-03-15T02:30:00Z'),
    },
  });
  const v1_7 = await prisma.changelogEntry.create({
    data: {
      version: 'v1.7 — March 16, 2026',
      title: 'Battle Arena Redesign, Username Onboarding & Challenge System Updates',
      body: `### ⚔️ Battle Arena Redesign
The battle screen has been completely overhauled for a more immersive, premium trading card game experience.

- Implemented a full-screen, five-zone layout to ensure all elements are visible without clipping.
- Redesigned battle cards with a fixed aspect ratio and all stats contained within the card boundaries.
- Replaced the flat black background with a dark, atmospheric arena environment.
- Typography overhaul for all numerical displays and card names.
- Both the player's and opponent's cards are now visible simultaneously.

***

### 👤 Username Onboarding
To personalize the experience, all players must now select a unique nickname upon their first login.

- Dedicated onboarding flow to choose and validate a unique nickname.
- All game systems (friends list, battle challenges, profile) now utilize your chosen nickname instead of default provider names.

***

### 🎮 Challenge System Improvements
Challenging your friends is now smoother and more reliable.

- Replaced the free-text input with a convenient autocomplete dropdown populated directly from your friends list.
- Removed the "random battle" option to streamline the challenge menu.
- Fixed critical issues where battles would fail to initiate or display correct team data upon accepting a challenge.

***

### 🐛 Bug Fixes & Polish
- **Achievements:** Fixed an issue where the achievement popover on the profile page would get cut off by its scrollable container.
- **Collection:** Clarified language types in the collection UI, visually distinguishing between the 10 core languages (used in battle mechanics) and neutral languages.
- **Inventory:** Fixed a display bug preventing the "The Open Source Heroes" booster pack from appearing correctly.`,
      createdAt: new Date('2026-03-16T16:30:00Z'),
    },
  });
  console.log('Created v1.7 changelog:', v1_7.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
