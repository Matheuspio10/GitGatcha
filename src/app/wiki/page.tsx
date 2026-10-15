'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useGameText, type GameValues } from '@/i18n/gameText';
import { DUPLICATE_FRAGMENTS, PACK_DROP_CHANCE, PACK_DROP_FRAGMENTS, SHINY_CHANCE, WILDCARD_EXCHANGE_RATE } from '@/lib/fragments';
import { RANK_TIERS, type RankTier } from '@/lib/ranks';
import { TOWER_FLOORS } from '@/lib/tower';
import { DAILY_SPRINT_LANGUAGES, SPRINT_REWARDS, SPRINT_TEAM_SIZE, WEEKLY_SPRINT_FAMILIES, sprintKindLabel, sprintRewardsLegend, type SprintKind } from '@/lib/sprints';
import { EVENT_PACK_CARD_COUNT, EVENT_PACK_COST, EVENT_PACK_MIN_RARITY, FEATURED_DEV_DISCOUNT, FEATURED_DEV_MIN_RARITY } from '@/lib/weeklyEvents';
import { PROMOTION_BITS, SEASON_REWARD_BITS } from '@/lib/seasons';
import { averagePullRates, RARITY_FOLLOWER_BANDS, RARITY_ORDER, STAR_BONUS_THRESHOLD } from '@/lib/rarity';
import {
  BALANCED_POWER_CAP_MULTIPLIER,
  CHALLENGE_TTL_HOURS,
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
  PASSIVE,
  PASSIVE_INFO,
  PASSIVE_RARITY_MULTIPLIER,
  RATING_K_FACTOR,
  STAMINA_COST_PER_BATTLE,
  STARTING_RATING,
  SYNERGY,
  TYPE_ADVANTAGES,
  TYPE_ADVANTAGE_MULTIPLIER,
  TYPE_DISADVANTAGE_MULTIPLIER,
  pctText,
  rarityScaledChance,
  typeWeaknesses,
} from '@/lib/battleConfig';
import { ACTIVE_RARITY_MULTIPLIER as RARITY_STAT_MULTIPLIER, FAME_FORMULA, IMPACT_FORMULA, STAT_FORMULA, STAT_MINIMUMS } from '@/lib/cardStats';
import { LIVING_CARD_REFRESH_DAYS } from '@/lib/livingCards';
import { DAILY_COOLDOWN_MS, LOGIN_CALENDAR_DAYS, LOGIN_CALENDAR_REWARDS, LOGIN_STREAK_WINDOW_MS } from '@/lib/loginCalendar';
import { PITY_THRESHOLD } from '@/lib/pity';
import { ACHIEVEMENTS, TIER_NAMES } from '@/lib/achievementUtils';
import { MAX_STAMINA, STAMINA_RECOVERY_RATE_PER_HOUR } from '@/lib/staminaUtils';
import { INVOCATION_COSTS } from '@/lib/forgeService';
import { COLLECTION_LANGUAGES, FRAMES, TITLES } from '@/lib/collections';
import { TRAINING_BONUS_PER_LEVEL, TRAINING_BITS_PER_STEP, TRAINING_FRAGMENTS_PER_STEP, TRAINING_MAX_LEVEL, fullTrainingCost } from '@/lib/training';
import {
  MagnifyingGlass,
  List,
  X,
  BookBookmark,
  Sword,
  Shield,
  Heart,
  Lightning,
  Star
} from '@phosphor-icons/react';

const pct = (x: number) => `${Math.round(x * 100)}%`;

const LANGUAGE_COLOR: Record<string, string> = {
  Python: 'text-blue-300', JavaScript: 'text-yellow-300', TypeScript: 'text-blue-400', Ruby: 'text-red-400',
  PHP: 'text-indigo-300', Rust: 'text-orange-500', C: 'text-gray-300', 'C++': 'text-gray-300', Go: 'text-cyan-400',
  Java: 'text-amber-500', 'C#': 'text-violet-400', Kotlin: 'text-fuchsia-400', Swift: 'text-orange-400',
  Dart: 'text-sky-400', Shell: 'text-lime-400', HTML: 'text-orange-300', CSS: 'text-blue-500', 'Jupyter Notebook': 'text-amber-300',
};

const HOURS = (ms: number) => Math.round(ms / 3_600_000);
/** XP granted by every daily claim (XP_AMOUNTS.LOGIN_STREAK in xpService.ts, which is server-only). */
const DAILY_CLAIM_XP = 20;
/** BITS to restore a card's stamina in the Collection (src/app/api/collection/recover/route.ts). */
const STAMINA_RESTORE_BITS = 100;

const LEAGUE_TITLE_COLOR: Record<string, string> = {
  OPEN: 'text-white',
  RANKED: 'text-orange-300',
  COMMON: 'text-green-400',
  BALANCED: 'text-blue-400',
  DIVERSITY: 'text-purple-400',
  LEGENDARY: 'text-yellow-500',
};

const COSMETIC_LABEL = (id: string) => id.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** Formula numbers as describeStatFormula() prints them (at most 2 decimals). */
const formulaNumber = (x: number) => +x.toFixed(2);

/** Values of the passives.<lang>.desc messages (gameBattle), from PASSIVE like PASSIVE_INFO. */
function passiveValues(lang: string, range: (base: number, inverse?: boolean) => string): GameValues | undefined {
  const P = PASSIVE;
  switch (lang) {
    case 'C / C++': return { defIgnored: pctText(P.rawPower.defIgnored) };
    case 'C#': return { chance: range(P.csharp.chance), critMult: P.csharp.critMult };
    case 'CSS': return { doubleChance: range(P.css.doubleChance), zeroChance: range(P.css.zeroChance, true) };
    case 'Dart': return { hpThreshold: pctText(P.dart.hpThreshold), heal: pctText(P.dart.healMaxHpPct) };
    case 'HTML': return { hpThreshold: pctText(P.html.hpThreshold), damageReduction: pctText(1 - P.html.damageTaken) };
    case 'Java': return { firstTurnPenalty: pctText(1 - P.java.firstTurnMult), perTurn: pctText(P.java.perTurn), maxBonus: pctText(P.java.maxBonus) };
    case 'JavaScript': return { chance: range(P.javascript.chance), damageMult: 1 + P.javascript.bonus };
    case 'Jupyter Notebook': return { regen: pctText(P.jupyter.regenAtkPct) };
    case 'Kotlin': return { maxHpPct: pctText(P.kotlin.maxHpPctPerTurn) };
    case 'PHP': return { hp: P.php.survivesAt };
    case 'Python': return { regen: pctText(P.python.regenAtkPct) };
    case 'Ruby': return { hpThreshold: pctText(P.ruby.hpThreshold), atkMult: P.ruby.atkMult };
    case 'Shell': return { every: P.shell.every, mult: P.shell.mult };
    case 'Swift': return { chance: range(P.swift.dodgeChance) };
    case 'TypeScript': return { reduction: pctText(1 - P.typescript.damageTaken) };
    default: return undefined;
  }
}

const SECTIONS = [
  { id: 'getting-started' },
  { id: 'cards-and-rarities' },
  { id: 'stats-explained' },
  { id: 'language-types' },
  { id: 'passive-abilities' },
  { id: 'battle-system' },
  { id: 'critical-hits-momentum' },
  { id: 'leagues-tournaments' },
  { id: 'stamina-system' },
  { id: 'loyalty-system' },
  { id: 'forge-system' },
  { id: 'team-synergies' },
  { id: 'daily-rewards' },
  { id: 'glossary' },
] as const;

export default function WikiPage() {
  const t = useTranslations('wiki');
  const locale = useLocale();
  const battleText = useGameText('gameBattle');
  const achText = useGameText('gameAchievements');
  const packText = useGameText('gamePacks');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('getting-started');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Translated game data (gameBattle / gameAchievements / gamePacks), English from src/lib as the fallback
  const rangeText = (base: number, inverse = false) => {
    const at = (r: string) => (inverse ? base / PASSIVE_RARITY_MULTIPLIER[r] : base * PASSIVE_RARITY_MULTIPLIER[r]);
    return battleText('rarityScaledChance', rarityScaledChance(base, inverse), { common: pctText(at('Common')), legendary: pctText(at('Legendary')) });
  };
  const passiveName = (lang: string) => battleText(`passives.${lang}.name`, PASSIVE_INFO.find(p => p.lang === lang)?.name ?? lang);
  const rankName = (tier: RankTier) => battleText(`ranks.${tier.id}.name`, tier.name);
  const sprintLegend = (kind: SprintKind) => {
    let from = 1;
    const parts = SPRINT_REWARDS[kind].map(r => {
      const part = r.upTo === from
        ? battleText('sprints.rewardsLegend.single', '', { place: from, bits: r.bits })
        : battleText('sprints.rewardsLegend.range', '', { from, to: r.upTo, bits: r.bits });
      from = r.upTo + 1;
      return part;
    });
    return parts.every(Boolean) ? parts.join(' · ') : sprintRewardsLegend(kind);
  };
  const tierNames = TIER_NAMES.map((name, i) => achText(`tiers.${i + 1}`, name));

  // Player-facing stat formulas (same numbers as describeStatFormula() in cardStats.ts)
  const statText = (() => {
    const n = formulaNumber;
    if (STAT_FORMULA === 'fame') {
      const f = FAME_FORMULA;
      return {
        atk: t('stats.formula.fame.atk', { base: n(f.atk.base), scale: n(f.atk.scale), offset: f.atk.offset, power: n(f.atk.power) }),
        def: t('stats.formula.fame.def', { hasBase: f.def.base > 0 ? 'yes' : 'no', base: n(f.def.base), scale: n(f.def.scale), gistWeight: n(f.def.gistWeight), exponent: n(f.def.exponent), followers: n(f.def.followers), repoCap: f.repoCap }),
        hp: t('stats.formula.fame.hp', { base: n(f.hp.base), years: n(f.hp.years), maxYears: f.hp.maxYears, followers: n(f.hp.followers) }),
      };
    }
    const f = IMPACT_FORMULA;
    return {
      atk: t('stats.formula.impact.atk', { offset: f.atk.offset, base: n(f.atk.base), exponent: n(f.atk.exponent), min: f.atk.min, max: f.atk.max }),
      def: t('stats.formula.impact.def', { hasBase: f.def.base > 0 ? 'yes' : 'no', base: n(f.def.base), scale: n(f.def.scale), gistWeight: n(f.def.gistWeight), exponent: n(f.def.exponent), repoCap: f.repoCap }),
      hp: t('stats.formula.impact.hp', { base: n(f.hp.base), years: n(f.hp.years), maxYears: f.hp.maxYears, hasRepos: f.hp.repos > 0 ? 'yes' : 'no', repos: n(f.hp.repos), hasFollowers: f.hp.followers > 0 ? 'yes' : 'no', followers: n(f.hp.followers) }),
    };
  })();

  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const code = (chunks: React.ReactNode) => <code>{chunks}</code>;

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

  const activeSectionInfo = SECTIONS.find(s => s.id === activeSection);

  const glossary = [
    { id: 'atk', term: t('glossary.atk.term'), def: t('glossary.atk.def') },
    { id: 'bits', term: t('glossary.bits.term'), def: t('glossary.bits.def') },
    { id: 'closer', term: t('glossary.closer.term'), def: t('glossary.closer.def') },
    { id: 'common', term: 'Common', def: t('glossary.common.def', { mult: RARITY_STAT_MULTIPLIER.Common }) },
    { id: 'def', term: t('glossary.def.term'), def: t('glossary.def.def', { k: DEF_MITIGATION_K, max: pct(MAX_DEF_MITIGATION) }) },
    { id: 'eternal', term: achText('loyalty.eternal.title', 'Eternal'), def: t('glossary.eternal.def', { battles: LOYALTY_MILESTONES[LOYALTY_MILESTONES.length - 1].threshold }) },
    { id: 'exhausted', term: t('glossary.exhausted.term'), def: t('glossary.exhausted.def') },
    { id: 'fragment', term: t('glossary.fragment.term'), def: t('glossary.fragment.def') },
    { id: 'hp', term: t('glossary.hp.term'), def: t('glossary.hp.def') },
    { id: 'legendary', term: 'Legendary', def: t('glossary.legendary.def', { mult: RARITY_STAT_MULTIPLIER.Legendary }) },
    { id: 'rating', term: t('glossary.rating.term'), def: t('glossary.rating.def', { lowest: rankName(RANK_TIERS[0]), highest: rankName(RANK_TIERS[RANK_TIERS.length - 1]), rating: STARTING_RATING }) },
    { id: 'mid', term: t('glossary.mid.term'), def: t('glossary.mid.def') },
    { id: 'momentum', term: t('glossary.momentum.term'), def: t('glossary.momentum.def') },
    { id: 'opener', term: t('glossary.opener.term'), def: t('glossary.opener.def') },
    { id: 'passive', term: t('glossary.passive.term'), def: t('glossary.passive.def') },
    { id: 'power', term: t('glossary.power.term'), def: t('glossary.power.def') },
    { id: 'synergy', term: t('glossary.synergy.term'), def: t('glossary.synergy.def') },
    { id: 'typeAdvantage', term: t('glossary.typeAdvantage.term'), def: t('glossary.typeAdvantage.def', { mult: TYPE_ADVANTAGE_MULTIPLIER }) },
    { id: 'veteran', term: achText('loyalty.veteran.title', 'Veteran'), def: t('glossary.veteran.def', { battles: LOYALTY_MILESTONES[0].threshold }) },
    { id: 'wishlist', term: t('glossary.wishlist.term'), def: t('glossary.wishlist.def') },
    { id: 'xp', term: t('glossary.xp.term'), def: t('glossary.xp.def') },
  ];
  // English keeps its hand-picked order; translated terms are sorted alphabetically
  const glossaryTerms = locale === 'en' ? glossary : [...glossary].sort((a, b) => a.term.localeCompare(b.term, locale));

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
              <span className="truncate">{activeSectionInfo ? t(`sections.${activeSectionInfo.id}`) : t('menu')}</span>
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
                  {t(`sections.${s.id}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar (Desktop) */}
        <aside className="hidden lg:flex w-72 flex-col fixed top-16 bottom-0 overflow-y-auto border-r border-slate-800/60 bg-slate-900/30 p-6 overscroll-contain pb-20 custom-scrollbar">
          <div className="flex items-center gap-3 mb-8 text-white">
            <BookBookmark size={28} weight="duotone" className="text-orange-500" />
            <h1 className="text-2xl font-black tracking-tight">{t('title')}</h1>
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
                {t(`sections.${section.id}`)}
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
                placeholder={t('searchPlaceholder')}
                className="w-full pl-12 pr-4 py-4 bg-slate-800/80 backdrop-blur-md border border-slate-700 text-white placeholder-slate-400 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label={t('clearSearch')}
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
                {t('sections.getting-started')}
              </h2>
              <div className="prose prose-invert prose-orange max-w-none">
                <p className="text-lg leading-relaxed text-slate-300">
                  {t('gettingStarted.intro')}
                </p>
                <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mt-6">
                  <h3 className="text-xl font-bold text-white mb-4">{t('gettingStarted.loopTitle')}</h3>
                  <ol className="list-decimal pl-5 space-y-3 text-slate-300">
                    <li>{t.rich('gettingStarted.openPacks', { b: chunks => <strong className="text-orange-400">{chunks}</strong>, link: chunks => <Link href="/store" className="text-indigo-400 hover:underline">{chunks}</Link> })}</li>
                    <li>{t.rich('gettingStarted.buildTeam', { b: chunks => <strong className="text-orange-400">{chunks}</strong>, link: chunks => <Link href="/battle" className="text-indigo-400 hover:underline">{chunks}</Link> })}</li>
                    <li>{t.rich('gettingStarted.battle', { b: chunks => <strong className="text-orange-400">{chunks}</strong>, link: chunks => <Link href="/leaderboard" className="text-indigo-400 hover:underline">{chunks}</Link> })}</li>
                  </ol>
                </div>
              </div>
            </section>

            {/* Section 2: Cards and Rarities */}
            <section id="cards-and-rarities" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <span id="cards-rarities" className="block -mt-32 pt-32" aria-hidden="true" />
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">02</span>
                {t('sections.cards-and-rarities')}
              </h2>
              <p className="mb-4 leading-relaxed">
                {t.rich('cards.intro', { count: RARITY_ORDER.length, b: strong })}
              </p>
              <p className="mb-6 leading-relaxed text-slate-400 text-sm">
                {t.rich('cards.random', { em: chunks => <em>{chunks}</em> })}
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
                    ? t('cards.followersOpen', { min: band.min.toLocaleString(locale) })
                    : t('cards.followersRange', { min: band.min.toLocaleString(locale), max: band.max.toLocaleString(locale) });
                  const bonus = STAR_BONUS_THRESHOLD[r];
                  const pull = averagePullRates()[r] * 100;
                  return (
                    <div key={r} className="bg-slate-900 border border-slate-700 rounded-xl p-5 flex items-start gap-4">
                      <div className={`px-3 py-1 rounded font-bold text-sm shadow-lg shadow-black/50 ${style[r].b} ${style[r].t}`}>
                        {r}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-400 mb-1">{t('cards.pullRate', { pct: Math.round(pull) })}</div>
                        <p className="text-sm text-slate-300">
                          {t('cards.baseStats', { followers, mult: RARITY_STAT_MULTIPLIER[r] })}
                          {bonus !== undefined && <> {t('cards.starBonus', { stars: bonus.toLocaleString(locale) })}</>}
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
                {t('sections.stats-explained')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Sword size={24} weight="fill" className="text-red-400" />
                    <h3 className="text-xl font-bold text-white">{t('stats.atkTitle')}</h3>
                  </div>
                  <p className="text-sm text-slate-300 mb-2">
                    {statText.atk}
                  </p>
                  <p className="text-sm text-slate-400">{t.rich('stats.atkDamage', { k: DEF_MITIGATION_K, code })}</p>
                </div>

                <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={24} weight="fill" className="text-blue-400" />
                    <h3 className="text-xl font-bold text-white">{t('stats.defTitle')}</h3>
                  </div>
                  <p className="text-sm text-slate-300 mb-2">
                    {statText.def}
                  </p>
                  <p className="text-sm text-slate-400">
                    {t.rich('stats.defBlock', { k: DEF_MITIGATION_K, max: pct(MAX_DEF_MITIGATION), code })}
                  </p>
                </div>

                <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Heart size={24} weight="fill" className="text-green-400" />
                    <h3 className="text-xl font-bold text-white">{t('stats.hpTitle')}</h3>
                  </div>
                  <p className="text-sm text-slate-300 mb-2">
                    {statText.hp}
                  </p>
                  <p className="text-sm text-slate-400">{t('stats.hpTurnCap', { turns: MATCHUP_TURN_CAP })}</p>
                </div>

                <div className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightning size={24} weight="fill" className="text-yellow-400" />
                    <h3 className="text-xl font-bold text-white">{t('stats.powerTitle')}</h3>
                  </div>
                  <p className="text-sm text-slate-300">{t.rich('stats.powerFormula', { code })}</p>
                  <p className="text-sm text-slate-400 mt-2">{t('stats.multiplierNote', { atk: STAT_MINIMUMS.atk, def: STAT_MINIMUMS.def, hp: STAT_MINIMUMS.hp })}</p>
                  <p className="text-sm text-slate-400 mt-2">{t('stats.livingCards', { days: LIVING_CARD_REFRESH_DAYS })}</p>
                </div>
              </div>
            </section>

            {/* Section 4: Language Types */}
            <section id="language-types" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">04</span>
                {t('sections.language-types')}
              </h2>
              <p className="mb-6 text-slate-300">
                {t.rich('types.intro', {
                  adv: TYPE_ADVANTAGE_MULTIPLIER,
                  dis: TYPE_DISADVANTAGE_MULTIPLIER,
                  good: chunks => <strong className="text-orange-400">{chunks}</strong>,
                  bad: chunks => <strong className="text-red-400">{chunks}</strong>,
                })}
              </p>

              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-800 text-slate-300 uppercase font-bold text-xs">
                    <tr>
                      <th className="px-6 py-4">{t('types.languageType')}</th>
                      <th className="px-6 py-4 text-green-400">{t('types.strongAgainst', { mult: TYPE_ADVANTAGE_MULTIPLIER })}</th>
                      <th className="px-6 py-4 text-red-400">{t('types.weakAgainst', { mult: TYPE_DISADVANTAGE_MULTIPLIER })}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50 bg-slate-900/50">
                    {COMBAT_LANGUAGES.map(lang => {
                      const strong: readonly string[] = TYPE_ADVANTAGES[lang] ?? [];
                      const weak: readonly string[] = lang === 'CSS' ? [t('types.everything')] : typeWeaknesses(lang);
                      return (
                        <tr key={lang} className="hover:bg-slate-800/50">
                          <td className={`px-6 py-4 font-bold ${LANGUAGE_COLOR[lang] ?? 'text-slate-200'}`}>{lang}</td>
                          <td className={`px-6 py-4 ${strong.length ? '' : 'text-slate-500'}`}>{strong.length ? strong.join(', ') : t('types.none')}</td>
                          <td className={`px-6 py-4 ${weak.length ? '' : 'text-slate-500'}`}>{weak.length ? weak.join(', ') : t('types.none')}</td>
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
                {t('sections.passive-abilities')}
              </h2>
              <p className="mb-8 text-slate-300">
                {t('passives.intro', { count: COMBAT_LANGUAGES.length })}
              </p>

              <div className="space-y-4">
                {PASSIVE_INFO.map((p) => (
                  <div key={p.name} className="flex flex-col sm:flex-row gap-4 bg-slate-800/20 p-5 rounded-xl border border-slate-700/30">
                    <div className="sm:w-1/3 flex items-center gap-2">
                       <span className="px-2.5 py-1 text-xs font-bold rounded bg-slate-700 text-white min-w-[70px] text-center border border-slate-600">
                         {p.lang}
                       </span>
                       <span className="font-bold text-orange-300">{battleText(`passives.${p.lang}.name`, p.name)}</span>
                    </div>
                    <div className="sm:w-2/3 text-slate-300 text-sm leading-relaxed">
                      {battleText(`passives.${p.lang}.desc`, p.desc, passiveValues(p.lang, rangeText))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 6: Battle System */}
            <section id="battle-system" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">06</span>
                {t('sections.battle-system')}
              </h2>
              <div className="prose prose-invert prose-orange max-w-none text-slate-300">
                <p>{t('battle.intro')}</p>

                <h4 className="text-white font-bold mt-6 mb-2">{t('battle.slotsTitle')}</h4>
                <ul>
                  <li>{t.rich('battle.opener', { b: strong })}</li>
                  <li>{t.rich('battle.mid', { b: strong })}</li>
                  <li>{t.rich('battle.closer', { b: strong })}</li>
                </ul>

                <h4 className="text-white font-bold mt-6 mb-2">{t('battle.orderTitle')}</h4>
                <ol>
                  <li>{t.rich('battle.orderBefore', { b: strong })}</li>
                  <li>{t.rich('battle.orderEntry', { b: strong, ironShield: passiveName('Rust'), firstStrike: passiveName('Go') })}</li>
                  <li>{t.rich('battle.orderTypes', { b: strong })}</li>
                  <li>{t.rich('battle.orderDamage', { b: strong, code, k: DEF_MITIGATION_K, passives: ['CSS', 'Ruby', 'Java', 'Shell', 'C#', 'C / C++', 'JavaScript'].map(passiveName).join(', ') })}</li>
                  <li>{t.rich('battle.orderDefense', { b: strong, typeSafety: passiveName('TypeScript'), gracefulDegradation: passiveName('HTML'), dodge: passiveName('Swift'), ironShield: passiveName('Rust'), nullSafety: passiveName('Kotlin') })}</li>
                  <li>{t.rich('battle.orderResolution', { b: strong, errorSuppression: passiveName('PHP'), hp: PASSIVE.php.survivesAt, hotReload: passiveName('Dart') })}</li>
                </ol>

                <h4 className="text-white font-bold mt-6 mb-2">{t('battle.decidedTitle')}</h4>
                <ul>
                  <li>{t('battle.decidedLastStanding')}</li>
                  <li>{t.rich('battle.decidedTie', { b: strong })}</li>
                </ul>
              </div>
            </section>

            {/* Section 7: Momentum */}
            <section id="critical-hits-momentum" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">07</span>
                {t('sections.critical-hits-momentum')}
              </h2>
              <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 p-6 rounded-xl border border-orange-500/30 mb-6">
                <h3 className="text-xl font-bold text-orange-400 mb-2 flex items-center gap-2">
                  <Star size={24} weight="fill" />
                  {t('momentum.title')}
                </h3>
                <p className="text-sm text-slate-300 mb-4">
                  {t.rich('momentum.intro', { b: strong, hl: chunks => <strong className="text-orange-400">{chunks}</strong> })}
                </p>
                <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li>{t.rich('momentum.onFire', { b: strong })}</li>
                  <li>{t.rich('momentum.bonus', { b: strong, one: pct(MOMENTUM_BONUS_PER_STACK), two: pct(2 * MOMENTUM_BONUS_PER_STACK) })}</li>
                  <li>{t('momentum.crits')}</li>
                </ul>
              </div>
            </section>

            {/* Section 8: Leagues and Tournaments */}
            <section id="leagues-tournaments" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">08</span>
                {t('sections.leagues-tournaments')}
              </h2>

              <p className="mb-6 text-slate-300">
                {t('leagues.intro', {
                  defenseBits: RANKED_DEFENSE_WIN_BITS,
                  ranks: RANK_TIERS.map(tier => `${rankName(tier)} ${tier.min > 0 ? tier.min + '+' : ''}`.trim()).join(' · '),
                  promotions: RANK_TIERS.filter(tier => PROMOTION_BITS[tier.id] > 0).map(tier => `${rankName(tier)} +${PROMOTION_BITS[tier.id]}`).join(' · '),
                  seasonRewards: RANK_TIERS.map(tier => `${rankName(tier)} +${SEASON_REWARD_BITS[tier.id]}`).join(' · '),
                  startingRating: STARTING_RATING,
                })}
              </p>
              <div className="space-y-4">
                {LEAGUE_MODES.map((mode) => {
                  const l = LEAGUES[mode];
                  return (
                    <div key={mode} className="bg-slate-800/30 p-5 rounded-xl border border-slate-700/50">
                      <h3 className={`text-lg font-bold mb-2 ${LEAGUE_TITLE_COLOR[mode]}`}>{battleText(`leagues.${mode}.label`, l.label)}</h3>
                      <p className="text-sm text-slate-300 mb-2">{battleText(`leagues.${mode}.rules`, l.rules, mode === 'BALANCED' ? { mult: BALANCED_POWER_CAP_MULTIPLIER } : undefined)}</p>
                      <p className="text-xs font-mono text-orange-400">
                        {t('leagues.rewards', { winBits: l.winBits, winXp: l.winXp, lossBits: l.lossBits, lossXp: l.lossXp })}
                        {l.entryFee > 0 && <> {t('leagues.entryFee', { fee: l.entryFee, net: `${l.winBits - l.entryFee >= 0 ? '+' : ''}${l.winBits - l.entryFee}`, loss: l.entryFee - l.lossBits })}</>}
                      </p>
                    </div>
                  );
                })}

                <div className="bg-slate-800/30 p-5 rounded-xl border border-orange-500/30">
                  <h3 className="text-lg font-bold text-orange-400 mb-2">{t('leagues.friendTitle')}</h3>
                  <p className="text-sm text-slate-300 mb-2">
                    {t.rich('leagues.friendText', { b: strong, hours: CHALLENGE_TTL_HOURS, rating: STARTING_RATING, k: RATING_K_FACTOR })}
                  </p>
                  <p className="text-xs font-mono text-orange-400">
                    {t('leagues.friendRewards', {
                      winBits: LEAGUES[FRIEND_BATTLE_LEAGUE].winBits,
                      winXp: LEAGUES[FRIEND_BATTLE_LEAGUE].winXp,
                      lossBits: LEAGUES[FRIEND_BATTLE_LEAGUE].lossBits,
                      lossXp: LEAGUES[FRIEND_BATTLE_LEAGUE].lossXp,
                    })}
                  </p>
                </div>
              </div>
              <div className="mt-4 bg-slate-800/30 p-5 rounded-xl border border-commit/30">
                <h3 className="text-lg font-bold text-commit mb-2">{t('leagues.upsetTitle')}</h3>
                <p className="text-sm text-slate-300">
                  {t('leagues.upsetText', { maxTier: RARITY_ORDER.length - 1, perTier: Math.round(UPSET_BONUS.perTier * 100), max: Math.round(UPSET_BONUS.max * 100) })}
                </p>
              </div>
              <div className="mt-4 bg-slate-800/30 p-5 rounded-xl border border-orange-500/30">
                <h3 className="text-lg font-bold text-orange-300 mb-2">{t('leagues.towerTitle')}</h3>
                <p className="text-sm text-slate-300">
                  {t('leagues.towerText', {
                    floors: TOWER_FLOORS.length,
                    miniBossFloor: TOWER_FLOORS.find(f => f.boss === 'mini')?.floor ?? TOWER_FLOORS.length,
                    finalFloor: TOWER_FLOORS.length,
                    rewards: TOWER_FLOORS.map(f => f.rewardBits).join(' · '),
                  })}
                </p>
              </div>
              <div className="mt-4 bg-slate-800/30 p-5 rounded-xl border border-cyan-500/30">
                <h3 className="text-lg font-bold text-cyan-300 mb-2">{t('leagues.sprintsTitle')}</h3>
                <p className="text-sm text-slate-300">
                  {t('leagues.sprintsText', { teamSize: SPRINT_TEAM_SIZE })}
                </p>
                <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li>{t.rich('leagues.dailySprint', { b: strong, name: battleText('sprints.kinds.daily.label', sprintKindLabel('daily')), languages: DAILY_SPRINT_LANGUAGES.join(', '), legend: sprintLegend('daily') })}</li>
                  <li>{t.rich('leagues.weeklySprint', { b: strong, name: battleText('sprints.kinds.weekly.label', sprintKindLabel('weekly')), families: WEEKLY_SPRINT_FAMILIES.map(f => battleText(`sprints.families.${f.id}.name`, f.name)).join(', '), legend: sprintLegend('weekly') })}</li>
                </ul>
              </div>
              <div className="mt-4 bg-slate-800/30 p-5 rounded-xl border border-fuchsia-500/30">
                <h3 className="text-lg font-bold text-fuchsia-300 mb-2">{t('leagues.eventsTitle')}</h3>
                <p className="text-sm text-slate-300">{t('leagues.eventsIntro')}</p>
                <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li>{t.rich('leagues.eventPack', { b: strong, count: EVENT_PACK_CARD_COUNT, cost: EVENT_PACK_COST, rarity: EVENT_PACK_MIN_RARITY })}</li>
                  <li>{t.rich('leagues.devOfWeek', { b: strong, rarity: FEATURED_DEV_MIN_RARITY, pct: Math.round(FEATURED_DEV_DISCOUNT * 100) })}</li>
                </ul>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {t('leagues.balancedCap', { mult: BALANCED_POWER_CAP_MULTIPLIER })}
              </p>
            </section>

             {/* Sections 9: Stamina */}
             <section id="stamina-system" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">09</span>
                {t('sections.stamina-system')}
              </h2>
              <div className="prose prose-invert prose-orange max-w-none text-slate-300 mb-6">
                <p>{t.rich('stamina.drain', { cost: STAMINA_COST_PER_BATTLE, red: chunks => <strong className="text-red-400">{chunks}</strong> })}</p>
                <p>{t.rich('stamina.recovery', { b: strong, rate: STAMINA_RECOVERY_RATE_PER_HOUR, max: MAX_STAMINA, cost: STAMINA_RESTORE_BITS })}</p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-5 py-3">{t('stamina.range')}</th>
                    <th className="px-5 py-3">{t('stamina.status')}</th>
                    <th className="px-5 py-3">{t('stamina.penalty')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 bg-slate-900/40">
                  <tr><td className="px-5 py-3 text-green-400 font-bold">81 - 100</td><td className="px-5 py-3 text-green-400">{t('stamina.fresh', { pct: 100 })}</td><td className="px-5 py-3">{t('stamina.none')}</td></tr>
                  <tr><td className="px-5 py-3 text-yellow-500 font-bold">61 - 80</td><td className="px-5 py-3 text-yellow-500">{t('stamina.tiring', { pct: 90 })}</td><td className="px-5 py-3 text-red-400">{t('stamina.atkDefPenalty', { pct: 10 })}</td></tr>
                  <tr><td className="px-5 py-3 text-orange-500 font-bold">41 - 60</td><td className="px-5 py-3 text-orange-500">{t('stamina.fatigued', { pct: 75 })}</td><td className="px-5 py-3 text-red-400">{t('stamina.atkDefPenalty', { pct: 25 })}</td></tr>
                  <tr><td className="px-5 py-3 text-red-500 font-bold">21 - 40</td><td className="px-5 py-3 text-red-500">{t('stamina.exhausted', { pct: 60 })}</td><td className="px-5 py-3 text-red-400 font-bold">{t('stamina.atkDefPenalty', { pct: 40 })}</td></tr>
                  <tr><td className="px-5 py-3 text-red-700 font-bold">1 - 20</td><td className="px-5 py-3 text-red-700">{t('stamina.critical', { pct: 40 })}</td><td className="px-5 py-3 text-red-500 font-bold">{t('stamina.atkDefPenalty', { pct: 60 })}</td></tr>
                  <tr><td className="px-5 py-3 font-bold text-slate-500">0</td><td className="px-5 py-3 text-slate-500">{t('stamina.drained')}</td><td className="px-5 py-3 text-slate-500">{t('stamina.cannotBattle')}</td></tr>
                </tbody>
              </table>
              </div>
            </section>

            {/* Section 10: Loyalty System */}
            <section id="loyalty-system" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">10</span>
                {t('sections.loyalty-system')}
              </h2>
              <p className="mb-6 text-slate-300">
                {t.rich('loyalty.intro', { b: strong })}
              </p>

              <div className="space-y-3">
                {LOYALTY_MILESTONES.map(m => ({
                  id: m.tier,
                  m: m.threshold,
                  t: achText(`loyalty.${m.tier}.title`, m.title),
                  stat: t('loyalty.stat', { atkDef: pct(m.atkDefBonus), hasHp: m.hpBonus > 0 ? 'yes' : 'no', hp: pct(m.hpBonus) }),
                  extra: m.cosmetics.map(c => achText(`loyaltyCosmetics.${c}`, COSMETIC_LABEL(c))).join(', '),
                })).map(l => (
                  <div key={l.id} className="flex flex-col sm:flex-row gap-4 bg-slate-800/10 p-4 rounded-xl border border-slate-700/50 items-center justify-between">
                    <div className="flex items-center gap-4 w-full sm:w-1/2">
                      <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center font-black text-slate-300">
                        {l.m}
                      </div>
                      <div>
                        <div className="font-bold text-white">{l.t}</div>
                        <div className="text-xs text-slate-400">{t('loyalty.battlesRequired')}</div>
                      </div>
                    </div>
                    <div className="w-full sm:w-1/2 text-sm text-slate-300 flex items-center justify-between">
                       <span className="font-bold text-green-400">{l.stat}</span>
                       <span className="text-xs italic text-slate-500 text-right">{l.extra}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-slate-800/30 p-5 rounded-xl border border-sky-500/30">
                <h3 className="text-lg font-bold text-sky-300 mb-2">{t('loyalty.trainingTitle')}</h3>
                <p className="text-sm text-slate-300">
                  {t.rich('loyalty.trainingText', { bonus: pct(TRAINING_BONUS_PER_LEVEL), em: chunks => <em>{chunks}</em> })}
                </p>
                <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-1">
                  {RARITY_ORDER.map(r => {
                    const full = fullTrainingCost(r);
                    return (
                      <li key={r}>
                        {t.rich('loyalty.trainingRarity', {
                          b: strong,
                          rarity: r,
                          maxLevel: TRAINING_MAX_LEVEL[r],
                          maxBonus: pct(TRAINING_MAX_LEVEL[r] * TRAINING_BONUS_PER_LEVEL),
                          stepBits: TRAINING_BITS_PER_STEP[r],
                          stepFragments: TRAINING_FRAGMENTS_PER_STEP[r],
                          fullBits: full.bits,
                          fullFragments: full.fragments,
                        })}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            {/* Section 11: Forge */}
            <section id="forge-system" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">11</span>
                {t('sections.forge-system')}
              </h2>
              <div className="prose prose-invert prose-orange max-w-none text-slate-300">
                <p>{t.rich('forge.intro', { link: chunks => <Link href="/forge" className="text-indigo-400 hover:underline">{chunks}</Link> })}</p>
                <ul>
                  <li>{t.rich('forge.searching', { b: strong })}</li>
                  <li>{t.rich('forge.fragments', { b: strong, costs: RARITY_ORDER.map(r => t('forge.cost', { rarity: r, fragments: INVOCATION_COSTS[r].fragments, bits: INVOCATION_COSTS[r].bits })).join(' · ') })}</li>
                  <li>{t.rich('forge.earning', { b: strong, duplicates: RARITY_ORDER.map(r => `${r} ${DUPLICATE_FRAGMENTS[r]}`).join(' · '), chance: Math.round(PACK_DROP_CHANCE * 100), count: PACK_DROP_FRAGMENTS })}</li>
                  <li>{t.rich('forge.wildcards', { b: strong, rate: WILDCARD_EXCHANGE_RATE })}</li>
                  <li>{t.rich('forge.shiny', { b: strong, chance: Math.round(SHINY_CHANCE * 100) })}</li>
                  <li>{t.rich('forge.wishlist', { b: strong })}</li>
                </ul>
              </div>
            </section>

            {/* Section 12: Synergies */}
            <section id="team-synergies" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">12</span>
                {t('sections.team-synergies')}
              </h2>
              <p className="mb-6 text-slate-300">{t('synergies.intro')}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {[
                  { id: 'mixed', name: t('synergies.mixed.name'), req: t('synergies.mixed.req'), effect: t('synergies.mixed.effect', { atk: pct(SYNERGY.mixedTeamAtk) }) },
                  { id: 'python', name: t('synergies.python.name'), req: t('synergies.python.req'), effect: t('synergies.python.effect', { regen: pct(SYNERGY.pythonRegenAtkPct), regenThree: pct(2 * SYNERGY.pythonRegenAtkPct) }) },
                  { id: 'rust', name: t('synergies.rust.name'), req: t('synergies.rust.req'), effect: t('synergies.rust.effect', { reduction: pct(SYNERGY.rustDamageReduction), reductionThree: pct(2 * SYNERGY.rustDamageReduction) }) },
                  { id: 'js', name: t('synergies.js.name'), req: t('synergies.js.req'), effect: t('synergies.js.effect', { chance: pct(SYNERGY.jsCallbackChance), chanceThree: pct(2 * SYNERGY.jsCallbackChance) }) },
                  { id: 'go', name: t('synergies.go.name'), req: t('synergies.go.req'), effect: t('synergies.go.effect', { firstStrike: passiveName('Go') }) },
                 ].map(syn => (
                   <div key={syn.id} className="bg-slate-800/30 border border-slate-700 rounded-lg p-5">
                     <h4 className="font-bold text-white mb-1">{syn.name}</h4>
                     <p className="text-xs text-orange-400 mb-3 font-mono">{t('synergies.requires', { requirement: syn.req })}</p>
                     <p className="text-sm text-slate-300">{syn.effect}</p>
                   </div>
                 ))}
              </div>
            </section>

            {/* Section 13: Daily Rewards, Pity and Achievements */}
            <section id="daily-rewards" className="scroll-mt-32 border-t border-slate-800/60 pt-12">
              <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm">13</span>
                {t('sections.daily-rewards')}
              </h2>

              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
                <h3 className="text-xl font-bold text-white mb-3">{t('daily.title', { days: LOGIN_CALENDAR_DAYS })}</h3>
                <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                  {t.rich('daily.text', {
                    link: chunks => <Link href="/store" className="text-indigo-400 hover:underline">{chunks}</Link>,
                    cooldown: HOURS(DAILY_COOLDOWN_MS),
                    window: HOURS(LOGIN_STREAK_WINDOW_MS),
                    days: LOGIN_CALENDAR_DAYS,
                    xp: DAILY_CLAIM_XP,
                  })}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  {LOGIN_CALENDAR_REWARDS.map(r => (
                    <div key={r.day} className={`rounded-lg border p-3 text-center ${r.packName ? 'border-yellow-500/50 bg-yellow-900/20' : 'border-slate-700 bg-slate-900/60'}`}>
                      <div className="text-xs font-bold text-slate-400 uppercase mb-1">{t('daily.day', { day: r.day })}</div>
                      <div className="text-lg font-black text-orange-400">{r.bits}</div>
                      <div className="text-[11px] text-slate-400">BITS</div>
                      {r.packName && <div className="text-[11px] text-yellow-300 mt-1">{t('daily.pack', { pack: r.packId ? packText(`packs.${r.packId}.name`, r.packName) : r.packName })}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/30 p-6 rounded-xl border border-fuchsia-500/30 mb-6">
                <h3 className="text-xl font-bold text-fuchsia-300 mb-3">{t('sets.title')}</h3>
                <p className="text-sm text-slate-300">
                  {t('sets.text', { count: COLLECTION_LANGUAGES.length, rarities: RARITY_ORDER.join(', ') })}
                </p>
                <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li>{t.rich('sets.titles', {
                    b: strong,
                    titles: TITLES.filter(title => !title.id.startsWith('set-')).map(title => `${achText(`titles.${title.id}.label`, title.label)} (${achText(`titles.${title.id}.requirement`, title.requirement).toLowerCase()})`).join(', '),
                    collector: achText('titles.languageSet.label', '<Language> Collector', { language: t('sets.languageWord') }),
                  })}</li>
                  <li>{t.rich('sets.frames', {
                    b: strong,
                    frames: FRAMES.map(f => `${achText(`frames.${f.id}.label`, f.label)} (${achText(`frames.${f.id}.requirement`, f.requirement).toLowerCase()})`).join(', '),
                  })}</li>
                </ul>
              </div>

              <div className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 p-6 rounded-xl border border-yellow-500/30 mb-6">
                <h3 className="text-xl font-bold text-yellow-400 mb-3 flex items-center gap-2">
                  <Star size={24} weight="fill" />
                  {t('pity.title')}
                </h3>
                <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
                  <li>{t('pity.counter')}</li>
                  <li>{t.rich('pity.guarantee', { b: strong, count: PITY_THRESHOLD - 1, hl: chunks => <strong className="text-yellow-400">{chunks}</strong> })}</li>
                  <li>{t('pity.reset')}</li>
                  <li>{t('pity.junk')}</li>
                  <li>{t('pity.store')}</li>
                </ul>
              </div>

              <h3 className="text-xl font-bold text-white mb-3">{t('achievements.title')}</h3>
              <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                {t('achievements.text', {
                  tiers: tierNames.length > 1
                    ? t('achievements.tierList', { rest: tierNames.slice(0, -1).join(', '), last: tierNames[tierNames.length - 1] })
                    : tierNames.join(''),
                })}
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800 text-slate-300 uppercase font-bold text-xs">
                    <tr>
                      <th className="px-4 py-3">{t('achievements.achievement')}</th>
                      <th className="px-4 py-3">{t('achievements.requirement')}</th>
                      {TIER_NAMES.map((tier, i) => <th key={tier} className="px-4 py-3 whitespace-nowrap">{tierNames[i]}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50 bg-slate-900/50">
                    {ACHIEVEMENTS.map(a => (
                      <tr key={a.id} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-bold text-orange-300 whitespace-nowrap">{achText(`achievements.${a.id}.name`, a.name)}</td>
                        <td className="px-4 py-3 text-slate-300">{achText(`achievements.${a.id}.description`, a.description.replace('{n}', 'N'), { n: 'N' })}</td>
                        {TIER_NAMES.map((tierName, i) => {
                          const tier = a.tiers[i];
                          return (
                            <td key={tierName} className="px-4 py-3 whitespace-nowrap text-slate-300">
                              {tier ? <>N = {tier.threshold.toLocaleString(locale)} <span className="text-slate-500">·</span> <span className="text-orange-400">{tier.reward} BITS</span></> : <span className="text-slate-500">—</span>}
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
                {t('sections.glossary')}
              </h2>

              <div className="columns-1 md:columns-2 gap-8 text-sm text-slate-300 space-y-4">
                {glossaryTerms.map(term => (
                   <div key={term.id} className="break-inside-avoid bg-slate-800/20 p-3 rounded-lg border border-slate-700/30">
                     <span className="font-bold text-orange-300 block mb-1">{term.term}</span>
                     <span className="leading-snug block">{term.def}</span>
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
