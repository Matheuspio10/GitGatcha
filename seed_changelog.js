const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Delete existing entries to avoid duplicates and ensure clean test
  await prisma.changelogEntry.deleteMany({});
  console.log('Cleared existing changelog entries.');

  const changelog = await prisma.changelogEntry.create({
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
    },
  });
  console.log('Created updated changelog:', changelog);
}

main().catch(console.error).finally(() => prisma.$disconnect());
