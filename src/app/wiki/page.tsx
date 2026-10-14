'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { DUPLICATE_FRAGMENTS, PACK_DROP_CHANCE, PACK_DROP_FRAGMENTS, SHINY_CHANCE, WILDCARD_EXCHANGE_RATE } from '@/lib/fragments';
import { RANK_TIERS } from '@/lib/ranks';
import { TOWER_FLOORS } from '@/lib/tower';
import { DAILY_SPRINT_LANGUAGES, SPRINT_TEAM_SIZE, WEEKLY_SPRINT_FAMILIES, sprintRewardsLegend } from '@/lib/sprints';
import { EVENT_PACK_CARD_COUNT, EVENT_PACK_COST, EVENT_PACK_MIN_RARITY, FEATURED_DEV_DISCOUNT, FEATURED_DEV_MIN_RARITY } from '@/lib/weeklyEvents';
import { PROMOTION_BITS, SEASON_REWARD_BITS } from '@/lib/seasons';
import { averagePullRates, RARITY_FOLLOWER_BANDS, RARITY_ORDER, STAR_BONUS_THRESHOLD } from '@/lib/rarity';
import {
  BALANCED_POWER_CAP_MULTIPLIER,
  COMBAT_LANGUAGES,
  DEF_MITIGATION_K,
  FRIEND_BATTLE_LEAGUE,
  LEAGUES,
  RANKED_DEFENSE_WIN_BITS,
  UPSET_BONUS,
  LEAGUE_MODES,
  LOYALTY_MILESTONES,
  MATCHUP_TURN_CAP,
  MAX_DEF_MITIGATION,
  MOMENTUM_BONUS_PER_STACK,
  PASSIVE_INFO,
  RATING_K_FACTOR,
  STAMINA_COST_PER_BATTLE,
  STARTING_RATING,
  SYNERGY,
  TYPE_ADVANTAGES,
  TYPE_ADVANTAGE_MULTIPLIER,
  TYPE_DISADVANTAGE_MULTIPLIER,
  typeWeaknesses,
} from '@/lib/battleConfig';
import { ACTIVE_RARITY_MULTIPLIER as RARITY_STAT_MULTIPLIER, describeStatFormula, STAT_MINIMUMS } from '@/lib/cardStats';
import { DAILY_COOLDOWN_MS, LOGIN_CALENDAR_DAYS, LOGIN_CALENDAR_REWARDS, LOGIN_STREAK_WINDOW_MS } from '@/lib/loginCalendar';
import { PITY_THRESHOLD } from '@/lib/pity';
import { ACHIEVEMENTS, TIER_NAMES } from '@/lib/achievementUtils';
import { MAX_STAMINA, STAMINA_RECOVERY_RATE_PER_HOUR } from '@/lib/staminaUtils';
import { INVOCATION_COSTS } from '@/lib/forgeService';
import { 
  MagnifyingGlass, 
  List, 
  X, 
  BookBookmark,
  Sword,
  Shield,
  Heart,
  Lightning,
  Star,
  CaretRight
} from '@phosphor-icons/react';

const pct = (x: number) => `${Math.round(x * 100)}%`;

const LANGUAGE_COLOR: Record<string, string> = {
  Python: 'text-blue-300', JavaScript: 'text-yellow-300', TypeScript: 'text-blue-400', Ruby: 'text-red-400',
  PHP: 'text-indigo-300', Rust: 'text-orange-500', C: 'text-gray-300', 'C++': 'text-gray-300', Go: 'text-cyan-400',
  Java: 'text-amber-500', 'C#': 'text-violet-400', Kotlin: 'text-fuchsia-400', Swift: 'text-orange-400',
  Dart: 'text-sky-400', Shell: 'text-lime-400', HTML: 'text-orange-300', CSS: 'text-blue-500', 'Jupyter Notebook': 'text-amber-300',
};

const STAT_TEXT = describeStatFormula();

const HOURS = (ms: number) => Math.round(ms / 3_600_000);
/** XP granted by every daily claim (XP_AMOUNTS.LOGIN_STREAK in xpService.ts, which is server-only). */
const DAILY_CLAIM_XP = 20;

const LEAGUE_TITLE_COLOR: Record<string, string> = {
  OPEN: 'text-white',
  RANKED: 'text-orange-300',
  COMMON: 'text-green-400',
  BALANCED: 'text-blue-400',
  DIVERSITY: 'text-purple-400',
  LEGENDARY: 'text-yellow-500',
};

const COSMETIC_LABEL = (id: string) => id.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

const SECTIONS = [
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'cards-and-rarities', title: 'Cards and Rarities' },
  { id: 'stats-explained', title: 'Stats Explained' },
  { id: 'language-types', title: 'Language Types and Advantages' },
  { id: 'passive-abilities', title: 'Passive Abilities' },
  { id: 'battle-system', title: 'Battle System' },
  { id: 'critical-hits-momentum', title: 'Momentum' },
  { id: 'leagues-tournaments', title: 'Leagues and Tournaments' },
  { id: 'stamina-system', title: 'Stamina System' },
  { id: 'loyalty-system', title: 'Loyalty Contract System' },
  { id: 'forge-system', title: 'Forge System' },
  { id: 'team-synergies', title: 'Team Synergies' },
  { id: 'daily-rewards', title: 'Daily Rewards, Pity and Achievements' },
  { id: 'glossary', title: 'Glossary' },
];

export default function WikiPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('getting-started');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Smooth scroll helper
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      // Add a small offset for the sticky header
      const y = element.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
    setActiveSection(id);
    setIsMobileMenuOpen(false);
  };

  // Intersection Observer to highlight active section in sidebar
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the visible section closest to the top
        const visibleEntries = entries.filter(e => e.isIntersecting);
        if (visibleEntries.length > 0) {
          // Sort by how close they are to the top of the viewport
          visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveSection(visibleEntries[0].target.id);
        }
      },
      { rootMargin: '-100px 0px -60% 0px' }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Real-time search scroll
  useEffect(() => {
    if (searchQuery.length < 3) return;
    
    // Simple Debounce for auto-scrolling
    const timeout = setTimeout(() => {
      const elements = contentRef.current?.querySelectorAll('h2, h3, p, li, td');
      if (!elements) return;

      for (let i = 0; i < elements.length; i++) {
        const text = elements[i].textContent?.toLowerCase() || '';
        if (text.includes(searchQuery.toLowerCase())) {
          // Found a match! Find closest parent section ID
          let parent: HTMLElement | null = elements[i] as HTMLElement;
          while (parent && !parent.id && parent !== contentRef.current) {
            parent = parent.parentElement;
          }
          if (parent?.id) {
            // Scroll to it
            const y = parent.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top: y, behavior: 'smooth' });
            setActiveSection(parent.id);
            break; // Stop after first match
          }
        }
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans">
      <div className="container mx-auto flex flex-col lg:flex-row min-h-screen">
        
        {/* Mobile Dropdown / Top Bar */}
        <div className="lg:hidden sticky top-[64px] z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 p-4 shadow-xl">
          <div className="flex gap-2">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex-1 flex items-center justify-between px-4 py-2 bg-slate-800 rounded-lg text-white font-semibold"
            >
              <span className="truncate">{SECTIONS.find(s => s.id === activeSection)?.title || 'Menu'}</span>
              {isMobileMenuOpen ? <X size={20} /> : <List size={20} />}
            </button>
          </div>
          
          {isMobileMenuOpen && (
            <div className="absolute left-0 right-0 top-full bg-slate-800 mt-1 max-h-[60vh] overflow-y-auto border-b border-slate-700 shadow-2xl flex flex-col">
              {SECTIONS.map((s) => (
                <button
                  key={`mob-${s.id}`}
                  onClick={() => scrollToSection(s.id)}
                  className={`text-left px-6 py-4 border-b border-slate-700/50 last:border-0 ${
                    activeSection === s.id ? 'text-orange-400 font-bold bg-slate-700/50' : 'text-slate-300 hover:bg-slate-700/30'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar (Desktop) */}
        <aside className="hidden lg:flex w-72 flex-col fixed top-16 bottom-0 overflow-y-auto border-r border-slate-800/60 bg-slate-900/30 p-6 overscroll-contain pb-20 custom-scrollbar">
          <div className="flex items-center gap-3 mb-8 text-white">
            <BookBookmark size={28} weight="duotone" className="text-orange-500" />
            <h1 className="text-2xl font-black tracking-tight">GitGacha Wiki</h1>
          </div>
          
          <nav className="flex flex-col gap-1.5">
            {SECTIONS.map((section) => (
              <button
                key={`desk-${section.id}`}
                onClick={() => scrollToSection(section.id)}
                className={`text-left px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${
                  activeSection === section.id
                    ? 'bg-orange-500/10 text-orange-400 font-bold border-l-2 border-orange-500 shadow-[inset_0_0_15px_rgba(249,115,22,0.05)]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border-l-2 border-transparent'
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 lg:ml-72 p-6 lg:p-12 pb-32">
          {/* Search Bar */}
          <div className="sticky top-[72px] lg:top-20 z-30 mb-12 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="relative max-w-2xl mx-auto shadow-2xl shadow-indigo-900/10 rounded-2xl overflow-hidden group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <MagnifyingGlass size={22} className="text-slate-500 group-focus-within:text-orange-400 transition-colors" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search the Wiki (mechanics, abilities, stats...)"
                className="w-full pl-12 pr-4 py-4 bg-slate-800/80 backdrop-blur-md border border-slate-700 text-white placeholder-slate-400 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all font-medium"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          </div>

          <div ref={contentRef} className="max-w-4xl mx-auto flex flex-col gap-16 wiki-content">
            
            {/* Section 1: Getting Started */}
            <section id="getting-started" className="scroll-mt-32">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">01</span>
                Getting Started
              </h2>
              <div className="prose prose-invert prose-orange max-w-none">
                <p className="text-lg leading-relaxed text-slate-300">
                  Welcome to GitGacha! GitGacha is an auto-battler card collection game where the cards are real developers based on their GitHub activity. 
                </p>
                <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mt-6">
                  <h3 className="text-xl font-bold text-white mb-4">The Core Gameplay Loop</h3>
                  <ol className="list-decimal pl-5 space-y-3 text-slate-300">
                    <li><strong className="text-orange-400">Open Packs:</strong> Spend BITS to open Gacha packs in the <Link href="/store" className="text-indigo-400 hover:underline">Store</Link> to acquire developer cards.</li>
                    <li><strong className="text-orange-400">Build a Team:</strong> Pick 3 developers from your collection in the <Link href="/battle" className="text-indigo-400 hover:underline">Arena</Link>. Factor in their Languages, Stats, and Synergies.</li>
                    <li><strong className="text-orange-400">Battle:</strong> Fight computer teams in the leagues to earn BITS & XP, or challenge friends in PvP to climb the <Link href="/leaderboard" className="text-indigo-400 hover:underline">rating ladder</Link>.</li>
                  </ol>
                </div>
              </div>
            </section>

            {/* Section 2: Cards and Rarities */}
            <section id="cards-and-rarities" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <span id="cards-rarities" className="block -mt-32 pt-32" aria-hidden="true" />
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">02</span>
                Cards and Rarities
              </h2>
              <p className="mb-4 leading-relaxed">
                Cards are ranked in 5 rarity tiers. A card&apos;s rarity comes from the developer&apos;s real GitHub <strong>followers</strong>; a developer whose repositories collect lots of <strong>stars</strong> is promoted one tier as a bonus. Rarity applies a multiplier to the card&apos;s base stats.
              </p>
              <p className="mb-6 leading-relaxed text-slate-400 text-sm">
                Boosters are truly random: within a booster&apos;s theme, <em>every</em> GitHub developer of the drawn rarity with at least one public repository has exactly the same chance to drop — famous or brand new, including you.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {RARITY_ORDER.map((r) => {
                  const style: Record<string, { b: string; t: string }> = {
                    Common: { b: 'bg-slate-500', t: 'text-slate-200' },
                    Uncommon: { b: 'bg-green-500', t: 'text-green-100' },
                    Rare: { b: 'bg-blue-500', t: 'text-blue-100' },
                    Epic: { b: 'bg-purple-500', t: 'text-purple-100' },
                    Legendary: { b: 'bg-yellow-500', t: 'text-yellow-900' },
                  };
                  const band = RARITY_FOLLOWER_BANDS[r];
                  const followers = band.max === null
                    ? `${band.min.toLocaleString('en-US')}+ followers`
                    : `${band.min.toLocaleString('en-US')}–${band.max.toLocaleString('en-US')} followers`;
                  const bonus = STAR_BONUS_THRESHOLD[r];
                  const pull = averagePullRates()[r] * 100;
                  return (
                    <div key={r} className="bg-slate-900 border border-slate-700 rounded-xl p-5 flex items-start gap-4">
                      <div className={`px-3 py-1 rounded font-bold text-sm shadow-lg shadow-black/50 ${style[r].b} ${style[r].t}`}>
                        {r}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-400 mb-1">Standard pull rate: ~{Math.round(pull)}% of cards</div>
                        <p className="text-sm text-slate-300">
                          {followers}. Base stats x{RARITY_STAT_MULTIPLIER[r]}.
                          {bonus !== undefined && <> With {bonus.toLocaleString('en-US')}+ stars the card is promoted one tier.</>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 3: Stats Explained */}
            <section id="stats-explained" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">03</span>
                Stats Explained
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Sword size={24} weight="fill" className="text-red-400" />
                    <h3 className="text-xl font-bold text-white">Attack (ATK)</h3>
                  </div>
                  <p className="text-sm text-slate-300 mb-2">
                    {STAT_TEXT.atk}
                  </p>
                  <p className="text-sm text-slate-400">Damage per hit: <code>ATK × {DEF_MITIGATION_K} / ({DEF_MITIGATION_K} + DEF)</code>, minimum 1. ATK also sets how much Python and Jupyter Notebook cards regenerate.</p>
                </div>
                
                <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={24} weight="fill" className="text-blue-400" />
                    <h3 className="text-xl font-bold text-white">Defense (DEF)</h3>
                  </div>
                  <p className="text-sm text-slate-300 mb-2">
                    {STAT_TEXT.def}
                  </p>
                  <p className="text-sm text-slate-400">
                    Blocks a share of every hit: <code>DEF / ({DEF_MITIGATION_K} + DEF)</code>. {DEF_MITIGATION_K} DEF halves the damage taken, and DEF never blocks more than {pct(MAX_DEF_MITIGATION)}. Diminishing returns: repo spam helps, but never makes a card immune.
                  </p>
                </div>

                <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Heart size={24} weight="fill" className="text-green-400" />
                    <h3 className="text-xl font-bold text-white">Health (HP)</h3>
                  </div>
                  <p className="text-sm text-slate-300 mb-2">
                    {STAT_TEXT.hp}
                  </p>
                  <p className="text-sm text-slate-400">If a single matchup lasts {MATCHUP_TURN_CAP} turns, the card with the higher remaining HP % wins it (an exact tie knocks out both).</p>
                </div>

                <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightning size={24} weight="fill" className="text-yellow-400" />
                    <h3 className="text-xl font-bold text-white">Power</h3>
                  </div>
                  <p className="text-sm text-slate-300"><code>ATK + DEF + HP</code>. Used for sorting in the collection and for the Balanced League team cap.</p>
                  <p className="text-sm text-slate-400 mt-2">Every stat is then multiplied by the card&apos;s rarity multiplier (minimum {STAT_MINIMUMS.atk} ATK, {STAT_MINIMUMS.def} DEF and {STAT_MINIMUMS.hp} HP). The formulas are tuned with a battle simulator so that rarity matters but upsets happen, and ATK, DEF and HP all decide fights.</p>
                </div>
              </div>
            </section>

            {/* Section 4: Language Types */}
            <section id="language-types" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">04</span>
                Language Types and Advantages
              </h2>
              <p className="mb-6 text-slate-300">
                Having a Type Advantage grants a <strong className="text-orange-400">{TYPE_ADVANTAGE_MULTIPLIER}x</strong> multiplier to damage dealt. A disadvantage applies a <strong className="text-red-400">{TYPE_DISADVANTAGE_MULTIPLIER}x</strong> multiplier. CSS deals {TYPE_DISADVANTAGE_MULTIPLIER}x to every typed language; Neutral cards (any other language) have no matchups.
              </p>

              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-800 text-slate-300 uppercase font-bold text-xs">
                    <tr>
                      <th className="px-6 py-4">Language Type</th>
                      <th className="px-6 py-4 text-green-400">Strong Against ({TYPE_ADVANTAGE_MULTIPLIER}x)</th>
                      <th className="px-6 py-4 text-red-400">Weak Against ({TYPE_DISADVANTAGE_MULTIPLIER}x)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50 bg-slate-900/50">
                    {COMBAT_LANGUAGES.map(lang => {
                      const strong: readonly string[] = TYPE_ADVANTAGES[lang] ?? [];
                      const weak: readonly string[] = lang === 'CSS' ? ['Everything (except Neutral)'] : typeWeaknesses(lang);
                      return (
                        <tr key={lang} className="hover:bg-slate-800/50">
                          <td className={`px-6 py-4 font-bold ${LANGUAGE_COLOR[lang] ?? 'text-slate-200'}`}>{lang}</td>
                          <td className={`px-6 py-4 ${strong.length ? '' : 'text-slate-500'}`}>{strong.length ? strong.join(', ') : 'None'}</td>
                          <td className={`px-6 py-4 ${weak.length ? '' : 'text-slate-500'}`}>{weak.length ? weak.join(', ') : 'None'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 5: Passive Abilities */}
            <section id="passive-abilities" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">05</span>
                Passive Abilities
              </h2>
              <p className="mb-8 text-slate-300">
                {COMBAT_LANGUAGES.length} languages have a unique passive that activates during battle. Chance-based passives scale slightly with rarity (Rare is the baseline); bad luck such as CSS&apos;s zero-damage turns gets rarer on rarer cards. Cards with any other language are Neutral.
              </p>

              <div className="space-y-4">
                {PASSIVE_INFO.map((p) => (
                  <div key={p.name} className="flex flex-col sm:flex-row gap-4 bg-slate-800/20 p-5 rounded-xl border border-slate-700/30">
                    <div className="sm:w-1/3 flex items-center gap-2">
                       <span className="px-2.5 py-1 text-xs font-bold rounded bg-slate-700 text-white min-w-[70px] text-center border border-slate-600">
                         {p.lang}
                       </span>
                       <span className="font-bold text-orange-300">{p.name}</span>
                    </div>
                    <div className="sm:w-2/3 text-slate-300 text-sm leading-relaxed">
                      {p.desc}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 6: Battle System */}
            <section id="battle-system" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">06</span>
                Battle System
              </h2>
              <div className="prose prose-invert prose-orange max-w-none text-slate-300">
                <p>GitGacha battles resolve completely automatically 3v3. Cards fight 1-on-1 until one is defeated, at which point the next card from that team enters the field.</p>
                
                <h4 className="text-white font-bold mt-6 mb-2">The Slots</h4>
                <ul>
                  <li><strong>Opener (Slot 1):</strong> Enters first. Good for First-Strike cards or high sustain cards to build early Momentum.</li>
                  <li><strong>Mid (Slot 2):</strong> The bridge. Often cleans up weak opponents or tanks the opponent&apos;s strong Mid.</li>
                  <li><strong>Closer (Slot 3):</strong> Your strongest card. Enters last to win the match.</li>
                </ul>

                <h4 className="text-white font-bold mt-6 mb-2">Order of Operations</h4>
                <ol>
                  <li><strong>Before the battle:</strong> Loyalty bonuses, then Stamina fatigue penalties, modify base stats. Team Synergies are applied.</li>
                  <li><strong>On entry:</strong> Iron Shield (Rust) goes up first, then every First Strike (Go) lands at the same time, so it makes no difference who challenged whom. The shield lasts until the end of that turn.</li>
                  <li><strong>Type Advantages:</strong> Multipliers are checked between active combatants.</li>
                  <li><strong>Damage Calculation:</strong> Both cards attack each other at the same time: <code>ATK × {DEF_MITIGATION_K} / ({DEF_MITIGATION_K} + DEF)</code>, modified by the type multiplier, Momentum and the attacker&apos;s passive (Undefined Behavior, Last Stand, JIT Warm-up, Cron Job, Critical Hit, Raw Power, Double Callback).</li>
                  <li><strong>Defense Checks:</strong> Type Safety, Graceful Degradation and Rust Synergy reduce the hit; Dodge and Iron Shield cancel it; Null Safety caps it.</li>
                  <li><strong>Resolution:</strong> HP is reduced (@ Error Suppression can keep a PHP card alive at 1 HP). Survivors trigger Hot Reload and regeneration. A card at 0 HP is defeated and the next one enters.</li>
                </ol>

                <h4 className="text-white font-bold mt-6 mb-2">How a Battle is Decided</h4>
                <ul>
                  <li>The team that still has a card standing when the other runs out wins.</li>
                  <li>If both last cards go down on the same turn, or the global turn limit stops the fight, the team with the higher remaining HP % wins. An exact tie goes to the <strong>defender</strong>.</li>
                </ul>
              </div>
            </section>

            {/* Section 7: Momentum */}
            <section id="critical-hits-momentum" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">07</span>
                Momentum
              </h2>
              <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 p-6 rounded-xl border border-orange-500/30 mb-6">
                <h3 className="text-xl font-bold text-orange-400 mb-2 flex items-center gap-2">
                  <Star size={24} weight="fill" />
                  Momentum System
                </h3>
                <p className="text-sm text-slate-300 mb-4">
                  If a single card defeats <strong>2 opponents in a row</strong> without dying, it achieves <strong className="text-orange-400">Momentum</strong>.
                </p>
                <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li>Displays an <strong>On Fire</strong> effect during battle.</li>
                  <li>Grants <strong>+{pct(MOMENTUM_BONUS_PER_STACK)} ATK and DEF</strong> after the 2nd consecutive knockout and <strong>+{pct(2 * MOMENTUM_BONUS_PER_STACK)}</strong> after the 3rd (a full sweep).</li>
                  <li>Only C# cards land critical hits; otherwise damage varies through types, passives and Momentum.</li>
                </ul>
              </div>
            </section>

            {/* Section 8: Leagues and Tournaments */}
            <section id="leagues-tournaments" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">08</span>
                Leagues and Tournaments
              </h2>
              
              <p className="mb-6 text-slate-300">
                League battles are against a computer team that follows the same restrictions as yours and never change your rating. Ranked is the exception: your opponent is the saved team of a player near your rating (they don&apos;t need to be online), and both ratings move. A saved team that holds earns its owner {RANKED_DEFENSE_WIN_BITS} BITS. Ranks: {RANK_TIERS.map(t => `${t.name} ${t.min > 0 ? t.min + '+' : ''}`.trim()).join(' · ')}. Seasons last a calendar month (UTC): the first time you reach a rank in a season pays {RANK_TIERS.filter(t => PROMOTION_BITS[t.id] > 0).map(t => `${t.name} +${PROMOTION_BITS[t.id]}`).join(' · ')} BITS, and at the end everyone who played PvP gets BITS for their peak rank ({RANK_TIERS.map(t => `${t.name} +${SEASON_REWARD_BITS[t.id]}`).join(' · ')}) before every rating moves halfway back to {STARTING_RATING}.
              </p>
              <div className="space-y-4">
                {LEAGUE_MODES.map((mode) => {
                  const l = LEAGUES[mode];
                  return (
                    <div key={mode} className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                      <h3 className={`text-lg font-bold mb-2 ${LEAGUE_TITLE_COLOR[mode]}`}>{l.label}</h3>
                      <p className="text-sm text-slate-300 mb-2">{l.rules}</p>
                      <p className="text-xs font-mono text-orange-400">
                        Win: {l.winBits} BITS + {l.winXp} XP | Loss: {l.lossBits} BITS + {l.lossXp} XP
                        {l.entryFee > 0 && <> | Entry fee: {l.entryFee} BITS (net {l.winBits - l.entryFee >= 0 ? '+' : ''}{l.winBits - l.entryFee} on a win, -{l.entryFee - l.lossBits} on a loss)</>}
                      </p>
                    </div>
                  );
                })}

                <div className="bg-slate-800/30 p-5 rounded-xl border border-orange-500/30">
                  <h3 className="text-lg font-bold text-orange-400 mb-2">Friend Challenges (PvP)</h3>
                  <p className="text-sm text-slate-300 mb-2">
                    Challenge a friend with any 3 cards; they have 24 hours to answer with their own team, and only see how many cards and which rarities you sent.
                    A card can only be in one pending challenge at a time. Friend challenges and Ranked are the only ways to change your <strong>rating</strong> (ELO, everyone starts at {STARTING_RATING}, K = {RATING_K_FACTOR}).
                  </p>
                  <p className="text-xs font-mono text-orange-400">
                    Win: {LEAGUES[FRIEND_BATTLE_LEAGUE].winBits} BITS + {LEAGUES[FRIEND_BATTLE_LEAGUE].winXp} XP | Loss: {LEAGUES[FRIEND_BATTLE_LEAGUE].lossBits} BITS + {LEAGUES[FRIEND_BATTLE_LEAGUE].lossXp} XP (both players)
                  </p>
                </div>
              </div>
              <div className="mt-4 bg-slate-800/30 p-5 rounded-xl border border-commit/30">
                <h3 className="text-lg font-bold text-commit mb-2">Upset Bonus</h3>
                <p className="text-sm text-slate-300">
                  Beat a team of higher average rarity (Common = 0 … Legendary = 4, averaged over the 3 cards) and the win pays
                  +{Math.round(UPSET_BONUS.perTier * 100)}% BITS per tier of difference, up to +{Math.round(UPSET_BONUS.max * 100)}%.
                  Works in every league and in friend challenges; XP is unchanged.
                </p>
              </div>
              <div className="mt-4 bg-slate-800/30 p-5 rounded-xl border border-orange-500/30">
                <h3 className="text-lg font-bold text-orange-300 mb-2">The Tower</h3>
                <p className="text-sm text-slate-300">
                  {TOWER_FLOORS.length} floors of computer teams that get harder, with a mini-boss on floor 5 and a Legendary boss on floor {TOWER_FLOORS.length}.
                  Every Monday (UTC) the tower gets a language theme and new teams, the same for everyone; you see the next opponents before you fight.
                  The first clear of each floor in a week pays {TOWER_FLOORS.map(f => f.rewardBits).join(' · ')} BITS. The weekly ranking orders players by highest floor, then fewest attempts.
                </p>
              </div>
              <div className="mt-4 bg-slate-800/30 p-5 rounded-xl border border-cyan-500/30">
                <h3 className="text-lg font-bold text-cyan-300 mb-2">Sprints</h3>
                <p className="text-sm text-slate-300">
                  Two competitions with a theme, with nothing to set up: when one ends, every player is scored by the power (ATK + DEF + HP) of their {SPRINT_TEAM_SIZE} strongest cards of the theme.
                  Only cards you had before the end count, and tied scores share the place (1, 1, 3). See them in Rankings → Sprints.
                </p>
                <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li><strong>Daily Sprint</strong> (midnight to midnight UTC): one language, in rotation ({DAILY_SPRINT_LANGUAGES.join(', ')}). BITS: {sprintRewardsLegend('daily')}.</li>
                  <li><strong>Weekly Sprint</strong> (Monday to Monday UTC): a family of languages ({WEEKLY_SPRINT_FAMILIES.map(f => f.name).join(', ')}). BITS: {sprintRewardsLegend('weekly')}.</li>
                </ul>
              </div>
              <div className="mt-4 bg-slate-800/30 p-5 rounded-xl border border-fuchsia-500/30">
                <h3 className="text-lg font-bold text-fuchsia-300 mb-2">Weekly events</h3>
                <p className="text-sm text-slate-300">Each week follows the theme of the Weekly Sprint:</p>
                <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li><strong>Event pack</strong>: {EVENT_PACK_CARD_COUNT} cards of the week&apos;s languages for {EVENT_PACK_COST} BITS, at least one {EVENT_PACK_MIN_RARITY}. On sale only that week (Store → Weekly Event); one you bought can be opened later. Like every pack, each developer of the theme has the same chance.</li>
                  <li><strong>Dev of the Week</strong>: a card of the theme ({FEATURED_DEV_MIN_RARITY} or better) drawn at random when the week starts. Invoking it at the Forge costs {Math.round(FEATURED_DEV_DISCOUNT * 100)}% less fragments and BITS until the week ends.</li>
                </ul>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Balanced League cap: {BALANCED_POWER_CAP_MULTIPLIER}× the average power of every card in the game; the Arena shows the current value.
              </p>
            </section>

             {/* Sections 9: Stamina */}
             <section id="stamina-system" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">09</span>
                Stamina System
              </h2>
              <div className="prose prose-invert prose-orange max-w-none text-slate-300 mb-6">
                <p>Developers get tired! Every battle (league or PvP) drains <strong className="text-red-400">{STAMINA_COST_PER_BATTLE} Stamina</strong> from each card used. As stamina drops, cards suffer penalties to their ATK and DEF in battles. At 0 stamina, they are Exhausted and cannot battle.</p>
                <p>Every card automatically recovers <strong>{STAMINA_RECOVERY_RATE_PER_HOUR} Stamina per hour</strong> (up to {MAX_STAMINA}), including the cards in your saved team. Alternatively, restore Stamina instantly in the Collection view for 100 BITS per card.</p>
              </div>

              <table className="w-full text-left text-sm whitespace-nowrap border border-slate-700 rounded-xl overflow-hidden">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-5 py-3">Stamina Range</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Battle Penalty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 bg-slate-900/40">
                  <tr><td className="px-5 py-3 text-green-400 font-bold">81 - 100</td><td className="px-5 py-3 text-green-400">Fresh (100%)</td><td className="px-5 py-3">None</td></tr>
                  <tr><td className="px-5 py-3 text-yellow-500 font-bold">61 - 80</td><td className="px-5 py-3 text-yellow-500">Tiring (90%)</td><td className="px-5 py-3 text-red-400">-10% ATK & DEF</td></tr>
                  <tr><td className="px-5 py-3 text-orange-500 font-bold">41 - 60</td><td className="px-5 py-3 text-orange-500">Fatigued (75%)</td><td className="px-5 py-3 text-red-400">-25% ATK & DEF</td></tr>
                  <tr><td className="px-5 py-3 text-red-500 font-bold">21 - 40</td><td className="px-5 py-3 text-red-500">Exhausted (60%)</td><td className="px-5 py-3 text-red-400 font-bold">-40% ATK & DEF</td></tr>
                  <tr><td className="px-5 py-3 text-red-700 font-bold">1 - 20</td><td className="px-5 py-3 text-red-700">Critical (40%)</td><td className="px-5 py-3 text-red-500 font-bold">-60% ATK & DEF</td></tr>
                  <tr><td className="px-5 py-3 font-bold text-slate-500">0</td><td className="px-5 py-3 text-slate-500">Completely Drained</td><td className="px-5 py-3 text-slate-500">Cannot Battle</td></tr>
                </tbody>
              </table>
            </section>

            {/* Section 10: Loyalty System */}
            <section id="loyalty-system" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">10</span>
                Loyalty Contract System
              </h2>
              <p className="mb-6 text-slate-300">
                Every battle a card fights (win or loss) adds to its <strong>Loyalty</strong>. As a card reaches Loyalty Milestones, it permanently unlocks <strong>Stat Multipliers</strong> (applied before every other battle modifier) and cosmetics.
              </p>

              <div className="space-y-3">
                {LOYALTY_MILESTONES.map(m => ({
                  m: m.threshold,
                  t: m.title,
                  stat: `+${pct(m.atkDefBonus)} ATK & DEF${m.hpBonus > 0 ? `, +${pct(m.hpBonus)} HP` : ''}`,
                  extra: m.cosmetics.map(COSMETIC_LABEL).join(', '),
                })).map(l => (
                  <div key={l.t} className="flex flex-col sm:flex-row gap-4 bg-slate-800/10 p-4 rounded-xl border border-slate-700/50 items-center justify-between">
                    <div className="flex items-center gap-4 w-full sm:w-1/2">
                      <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center font-black text-slate-300">
                        {l.m}
                      </div>
                      <div>
                        <div className="font-bold text-white">{l.t}</div>
                        <div className="text-xs text-slate-400">Battles Required</div>
                      </div>
                    </div>
                    <div className="w-full sm:w-1/2 text-sm text-slate-300 flex items-center justify-between">
                       <span className="font-bold text-green-400">{l.stat}</span>
                       <span className="text-xs italic text-slate-500 text-right">{l.extra}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 11: Forge */}
            <section id="forge-system" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">11</span>
                Forge System
              </h2>
              <div className="prose prose-invert prose-orange max-w-none text-slate-300">
                <p>The <Link href="/forge" className="text-indigo-400 hover:underline">Forge</Link> allows you to bypass the Gacha randomness and directly craft the exact developer card you want.</p>
                <ul>
                  <li><strong>Searching:</strong> Type any valid GitHub username to pull that developer&apos;s live stats into the app.</li>
                  <li><strong>Fragments:</strong> Crafting requires Language Fragments matching the target developer&apos;s primary language (wildcards cover any shortfall), plus BITS. The cost depends on the card&apos;s rarity: {RARITY_ORDER.map(r => `${r} ${INVOCATION_COSTS[r].fragments} fragments + ${INVOCATION_COSTS[r].bits} BITS`).join(' · ')}.</li>
                  <li><strong>Earning Fragments:</strong> Pulling a card you already have counts it (x2, x3…) and gives fragments of its language: {RARITY_ORDER.map(r => `${r} ${DUPLICATE_FRAGMENTS[r]}`).join(' · ')}. Each booster also has a {Math.round(PACK_DROP_CHANCE * 100)}% chance to drop {PACK_DROP_FRAGMENTS} fragments of its theme (or most common) language.</li>
                  <li><strong>Wildcards:</strong> Trade {WILDCARD_EXCHANGE_RATE} fragments of any language for 1 wildcard fragment. Wildcards pay for any language, and they are the only way to craft developers with no primary language.</li>
                  <li><strong>Shiny:</strong> Every pull has a {Math.round(SHINY_CHANCE * 100)}% chance to be Shiny, duplicates included: a duplicate can turn your card Shiny.</li>
                  <li><strong>Wishlist:</strong> Add developers to your Wishlist to easily track your fragment progress towards acquiring them.</li>
                </ul>
              </div>
            </section>

            {/* Section 12: Synergies */}
            <section id="team-synergies" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">12</span>
                Team Synergies
              </h2>
              <p className="mb-6 text-slate-300">Stacking cards of identical languages grants powerful Synergy passives to your entire team. Mixed diversity also grants bonuses.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {[
                  { name: 'Mixed Team Synergy', req: '3 different types', effect: `+${pct(SYNERGY.mixedTeamAtk)} ATK to ALL cards on the team.` },
                  { name: 'Python Synergy', req: '2 or 3 Python / Jupyter Notebook cards', effect: `Teammates regenerate HP equal to ${pct(SYNERGY.pythonRegenAtkPct)} of their ATK each turn (${pct(2 * SYNERGY.pythonRegenAtkPct)} with 3). Python and Jupyter cards heal at whichever rate is higher, theirs or the synergy's.` },
                  { name: 'Rust Synergy', req: '2 or 3 Rust cards', effect: `All 3 cards take ${pct(SYNERGY.rustDamageReduction)} less damage (${pct(2 * SYNERGY.rustDamageReduction)} with 3 Rust cards).` },
                  { name: 'JS Synergy', req: '2 or 3 JS cards', effect: `Non-JS teammates get a ${pct(SYNERGY.jsCallbackChance)} chance to Double Callback each turn (${pct(2 * SYNERGY.jsCallbackChance)} with 3; JS cards keep their own chance).` },
                  { name: 'Go Synergy', req: '2 or 3 Go cards', effect: 'All 3 cards gain the Go First Strike ability.' },
                 ].map(syn => (
                   <div key={syn.name} className="bg-slate-800/30 border border-slate-700 rounded-lg p-5">
                     <h4 className="font-bold text-white mb-1">{syn.name}</h4>
                     <p className="text-xs text-orange-400 mb-3 font-mono">Requires: {syn.req}</p>
                     <p className="text-sm text-slate-300">{syn.effect}</p>
                   </div>
                 ))}
              </div>
            </section>

            {/* Section 13: Daily Rewards, Pity and Achievements */}
            <section id="daily-rewards" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">13</span>
                Daily Rewards, Pity and Achievements
              </h2>

              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
                <h3 className="text-xl font-bold text-white mb-3">Daily Rewards ({LOGIN_CALENDAR_DAYS}-day login calendar)</h3>
                <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                  Claim a daily reward in the <Link href="/store" className="text-indigo-400 hover:underline">Store</Link> once every {HOURS(DAILY_COOLDOWN_MS)} hours.
                  Claiming again within {HOURS(LOGIN_STREAK_WINDOW_MS)} hours of your last claim advances your calendar; waiting longer restarts it at day 1.
                  After day {LOGIN_CALENDAR_DAYS} a new cycle starts. Every claim also grants {DAILY_CLAIM_XP} XP.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  {LOGIN_CALENDAR_REWARDS.map(r => (
                    <div key={r.day} className={`rounded-lg border p-3 text-center ${r.packName ? 'border-yellow-500/50 bg-yellow-900/20' : 'border-slate-700 bg-slate-900/60'}`}>
                      <div className="text-xs font-bold text-slate-400 uppercase mb-1">Day {r.day}</div>
                      <div className="text-lg font-black text-orange-400">{r.bits}</div>
                      <div className="text-[11px] text-slate-400">BITS</div>
                      {r.packName && <div className="text-[11px] text-yellow-300 mt-1">+ {r.packName} (added to your Inventory)</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 p-6 rounded-xl border border-yellow-500/30 mb-6">
                <h3 className="text-xl font-bold text-yellow-400 mb-3 flex items-center gap-2">
                  <Star size={24} weight="fill" />
                  Legendary Pity
                </h3>
                <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li>Every booster you open without a Legendary card adds 1 to your pity counter.</li>
                  <li>After <strong>{PITY_THRESHOLD - 1} packs in a row</strong> without one, your next pack&apos;s last card is <strong className="text-yellow-400">guaranteed Legendary</strong>.</li>
                  <li>Pulling any Legendary (including one promoted by the star bonus) resets the counter.</li>
                  <li>All-Common packs (Junk Drawer) don&apos;t count.</li>
                  <li>The Store shows &quot;Legendary guaranteed within N packs&quot; and the per-card drop rates.</li>
                </ul>
              </div>

              <h3 className="text-xl font-bold text-white mb-3">Achievements</h3>
              <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                Each achievement has {TIER_NAMES.join(', ').replace(/, ([^,]*)$/, ' and $1')} tiers; every tier pays BITS once, the moment you reach it.
                Progress is checked after opening packs, after battles, when you claim the daily reward and when you open your own profile.
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800 text-slate-300 uppercase font-bold text-xs">
                    <tr>
                      <th className="px-4 py-3">Achievement</th>
                      <th className="px-4 py-3">Requirement</th>
                      {TIER_NAMES.map(t => <th key={t} className="px-4 py-3 whitespace-nowrap">{t}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50 bg-slate-900/50">
                    {ACHIEVEMENTS.map(a => (
                      <tr key={a.id} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-bold text-orange-300 whitespace-nowrap">{a.name}</td>
                        <td className="px-4 py-3 text-slate-300">{a.description.replace('{n}', 'N')}</td>
                        {TIER_NAMES.map((t, i) => {
                          const tier = a.tiers[i];
                          return (
                            <td key={t} className="px-4 py-3 whitespace-nowrap text-slate-300">
                              {tier ? <>N = {tier.threshold.toLocaleString('en-US')} <span className="text-slate-500">·</span> <span className="text-orange-400">{tier.reward} BITS</span></> : <span className="text-slate-600">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 14: Glossary */}
            <section id="glossary" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">14</span>
                Glossary
              </h2>
              
              <div className="columns-1 md:columns-2 gap-8 text-sm text-slate-300 space-y-4">
                {[
                  { t: 'ATK', d: 'Base Attack stat. Determines damage dealt.' },
                  { t: 'BITS', d: 'The in-game currency used to buy packs, craft in the Forge, enter the Legendary League and restore stamina.' },
                  { t: 'Closer', d: 'The third and final card slot in a team.' },
                  { t: 'Common', d: `The lowest rarity tier (${RARITY_STAT_MULTIPLIER.Common}x stat multiplier).` },
                  { t: 'DEF', d: `Base Defense stat. Blocks DEF / (${DEF_MITIGATION_K} + DEF) of every hit, up to ${pct(MAX_DEF_MITIGATION)}.` },
                  { t: 'Eternal', d: `The maximum Loyalty rank, reached at ${LOYALTY_MILESTONES[LOYALTY_MILESTONES.length - 1].threshold} battles.` },
                  { t: 'Exhausted', d: 'A card at 0 Stamina. Cannot participate in battles.' },
                  { t: 'Fragment', d: 'Currency earned from dupes, used in the Forge to craft specific cards.' },
                  { t: 'HP', d: 'Health Points. Reaching 0 means defeat.' },
                  { t: 'Legendary', d: `The highest rarity tier (${RARITY_STAT_MULTIPLIER.Legendary}x stat multiplier). Very low pull rates.` },
                  { t: 'Rating', d: `PvP ELO score (Ranked and friend challenges) shown on the leaderboard, with a rank from Bronze to Diamond. Starts at ${STARTING_RATING}.` },
                  { t: 'Mid', d: 'The second card slot in a team.' },
                  { t: 'Momentum', d: 'ATK/DEF bonus activated after a single card defeats 2 enemies in a row.' },
                  { t: 'Opener', d: 'The first card slot. Enters battle first.' },
                  { t: 'Passive', d: 'An innate ability specific to a language type.' },
                  { t: 'Power', d: 'Composite strength score of ATK, DEF, and HP.' },
                  { t: 'Synergy', d: 'Team-wide bonus granted by stacking similar card types.' },
                  { t: 'Type Advantage', d: `When a language beats another, granting ${TYPE_ADVANTAGE_MULTIPLIER}x damage.` },
                  { t: 'Veteran', d: `First Loyalty rank, reached at ${LOYALTY_MILESTONES[0].threshold} battles.` },
                  { t: 'Wishlist', d: 'Forge feature measuring fragment progress for a target card.' },
                  { t: 'XP', d: 'Account experience earned from battles and other activities. Leveling up grants reward boosters.' },
                ].map(term => (
                   <div key={term.t} className="break-inside-avoid bg-slate-800/20 p-3 rounded-lg border border-slate-700/30">
                     <span className="font-bold text-orange-300 block mb-1">{term.t}</span>
                     <span className="leading-snug block">{term.d}</span>
                   </div>
                ))}
              </div>
            </section>

          </div>
        </main>
      </div>
    </div>
  );
}
