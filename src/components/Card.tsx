import React from 'react';
import { Shield, Sword, Heart } from '@phosphor-icons/react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { calculateCurrentStamina, getStaminaMultiplier } from '@/lib/staminaUtils';
import { RarityGem, RARITY_GEM_COLORS } from '@/components/RarityGem';
import { useHoloGyro, trackHoloPointer, resetHoloPointer } from '@/lib/holoTilt';
import { COMBAT_LANGUAGES } from '@/lib/battleConfig';

export type CardProps = {
  id?: string;
  name: string;
  githubUsername: string;
  avatarUrl: string;
  flavorText: string;
  atk: number;
  def: number;
  hp: number;
  rarity: string;
  primaryLanguage?: string;
  quantity?: number;
  disableLink?: boolean;
  isShiny?: boolean;
  userCardId?: string;
  stamina?: number;
  lastUsedAt?: Date | string;
  inActiveTeam?: boolean;
  loyaltyTier?: string;
  loyaltyCount?: number;
  /** "signature": the player's own card, granted only by connecting GitHub */
  edition?: string;
};

const RARITY_KEYS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

/** Header tag + accents per rarity (the frame itself lives in globals.css: .card-frame--<Rarity>) */
const RARITY_TAG: Record<string, string> = {
  Common: 'bg-slate-500/25 text-slate-200 border-slate-400/40',
  Uncommon: 'bg-green-500/20 text-green-100 border-green-400/50',
  Rare: 'bg-blue-500/25 text-blue-100 border-blue-400/60',
  Epic: 'bg-purple-500/30 text-fuchsia-100 border-fuchsia-400/60',
  Legendary: 'bg-gradient-to-r from-amber-500/50 to-yellow-300/30 text-yellow-50 border-yellow-300/80',
};

const RARITY_ACCENT: Record<string, string> = {
  Common: 'rgba(148,163,184,0.35)',
  Uncommon: 'rgba(74,222,128,0.45)',
  Rare: 'rgba(96,165,250,0.6)',
  Epic: 'rgba(217,70,239,0.6)',
  Legendary: 'rgba(250,204,21,0.75)',
};

/** Small faceted gem set into the frame corners (Rare and above). */
function CornerGem({ rarity, className }: { rarity: string; className: string }) {
  const c = RARITY_GEM_COLORS[rarity] || RARITY_GEM_COLORS.Common;
  return (
    <span
      aria-hidden
      className={clsx('absolute z-40 w-2.5 h-2.5 rotate-45 rounded-[2px] pointer-events-none', className)}
      style={{
        background: `linear-gradient(135deg, ${c.light} 0%, ${c.mid} 45%, ${c.dark} 100%)`,
        boxShadow: `0 0 6px ${c.mid}, inset 0 0 0 1px rgba(255,255,255,0.35)`,
      }}
    />
  );
}

const LANG_COLORS: Record<string, string> = {
  JavaScript: 'from-yellow-400/20 to-yellow-600/20',
  TypeScript: 'from-blue-400/20 to-blue-600/20',
  Python: 'from-blue-300/20 to-yellow-300/20',
  Java: 'from-orange-400/20 to-red-600/20',
  Rust: 'from-orange-500/20 to-stone-500/20',
  Go: 'from-cyan-400/20 to-cyan-600/20',
  Ruby: 'from-red-400/20 to-red-600/20',
  C: 'from-gray-400/20 to-gray-600/20',
  'C++': 'from-indigo-400/20 to-indigo-600/20',
  'C#': 'from-purple-400/20 to-purple-600/20',
  PHP: 'from-indigo-300/20 to-purple-400/20',
  HTML: 'from-orange-500/20 to-orange-700/20',
  CSS: 'from-blue-500/20 to-blue-700/20',
  Unknown: 'from-slate-700/20 to-slate-900/20',
};

const LOYALTY_VISUALS: Record<string, { borderClass?: string; glowColor?: string; badgeIcon?: string; badgeColor?: string }> = {
  none: {},
  veteran: { badgeIcon: '⭐', badgeColor: '#a78bfa' },
  trusted: { borderClass: 'border-yellow-500/60', glowColor: 'rgba(251,191,36,0.15)', badgeIcon: '🛡️', badgeColor: '#fbbf24' },
  reliable: { borderClass: 'border-orange-500/60', glowColor: 'rgba(249,115,22,0.2)', badgeIcon: '🔥', badgeColor: '#f97316' },
  legendary_bond: { borderClass: 'border-pink-500/60', glowColor: 'rgba(236,72,153,0.25)', badgeIcon: '💎', badgeColor: '#ec4899' },
  eternal: { borderClass: 'border-cyan-400/70', glowColor: 'rgba(6,182,212,0.3)', badgeIcon: '♾️', badgeColor: '#06b6d4' },
};

// Languages with a combat passive (everything else fights as Neutral)
const CORE_LANGUAGES: readonly string[] = COMBAT_LANGUAGES;

function getLoyaltyBorderOverride(tier: string): string | undefined {
  return LOYALTY_VISUALS[tier]?.borderClass;
}

export function Card({
  name,
  githubUsername,
  avatarUrl,
  flavorText,
  atk,
  def,
  hp,
  rarity,
  primaryLanguage = 'Unknown',
  quantity,
  disableLink = false,
  isShiny = false,
  stamina,
  lastUsedAt,
  inActiveTeam,
  loyaltyTier,
  loyaltyCount,
  edition,
}: CardProps) {
  const isSignature = edition === 'signature';
  
  const tier = loyaltyTier || 'none';
  const loyaltyVisual = LOYALTY_VISUALS[tier] || {};
  const rarityKey = RARITY_KEYS.includes(rarity) ? rarity : 'Common';
  const bgGradient = LANG_COLORS[primaryLanguage] || LANG_COLORS.Unknown;

  const currentStamina = stamina !== undefined ? calculateCurrentStamina(stamina, lastUsedAt || new Date(), inActiveTeam || false) : undefined;
  const multiplier = currentStamina !== undefined ? getStaminaMultiplier(currentStamina) : 1;
  const fatigued = multiplier < 1;

  const displayAtk = Math.floor(atk * multiplier);
  const displayDef = Math.floor(def * multiplier);

  // Loyalty tiers (trusted+) draw an inner ring so the rarity frame stays readable
  const loyaltyBorder = getLoyaltyBorderOverride(tier);
  const isEternal = tier === 'eternal';
  const isLegendaryBond = tier === 'legendary_bond';

  // Rarity frame unless a state takes over the border (fatigue colours, Signature foil)
  const useRarityFrame = !fatigued && !isSignature;
  const isHighRarity = rarityKey === 'Rare' || rarityKey === 'Epic' || rarityKey === 'Legendary';
  // Holographic sheen following the pointer / device tilt
  const hasHolo = (isShiny || rarityKey === 'Epic' || rarityKey === 'Legendary') && currentStamina !== 0;
  useHoloGyro(hasHolo);

  const cardClasses = clsx(
    "relative w-64 h-[410px] rounded-xl border-[5px] overflow-hidden bg-slate-900 text-white flex flex-col font-sans transition-shadow duration-300 group flex-shrink-0",
    hasHolo && "card-holo-host",
    useRarityFrame && `card-frame card-frame--${rarityKey}`,
    useRarityFrame && isShiny && "card-shiny",
    fatigued && (currentStamina === 0
      ? "border-red-900 shadow-[0_0_14px_rgba(127,29,29,0.6)]"
      : "border-yellow-600 shadow-[0_0_14px_rgba(202,138,4,0.5)]"),
    currentStamina === 0 && "opacity-80 grayscale-[50%]",
    isSignature && !fatigued && "border-transparent shadow-[0_0_28px_rgba(240,171,252,0.55)]"
  );

  // Signature edition: animated pastel-rainbow foil frame + double inner line (distinct from every rarity frame)
  const cardStyle: React.CSSProperties | undefined = isSignature && !fatigued
    ? {
        background: 'linear-gradient(#0f172a, #0f172a) padding-box, linear-gradient(115deg, #f0abfc, #67e8f9, #fde68a, #86efac, #a78bfa, #f0abfc) border-box',
        backgroundSize: '100% 100%, 300% 300%',
        animation: 'signatureFoil 5s ease infinite',
      }
    : undefined;

  const holoHandlers = hasHolo ? { onPointerMove: trackHoloPointer, onPointerLeave: resetHoloPointer } : {};

  const cardContent = (
    <>
      {/* Background Gradient based on Lang */}
      <div className={clsx("absolute inset-0 bg-gradient-to-br opacity-50", bgGradient)} />

      {/* Eternal holographic frame */}
      {isEternal && (
        <div
          className="absolute inset-0 pointer-events-none z-[5]"
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(168,85,247,0.15) 25%, rgba(236,72,153,0.15) 50%, rgba(251,191,36,0.15) 75%, rgba(6,182,212,0.15) 100%)',
            backgroundSize: '400% 400%',
            animation: 'holoShift 6s ease infinite',
          }}
        />
      )}

      {/* Legendary Bond particle effect */}
      {isLegendaryBond && (
        <div className="absolute inset-0 pointer-events-none z-[5] overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-pink-400/60"
              style={{
                left: `${15 + i * 14}%`,
                animation: `particleFloat ${2 + i * 0.4}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Loyalty glow overlay */}
      {loyaltyVisual.glowColor && !fatigued && (
        <div
          className="absolute inset-0 pointer-events-none z-[4]"
          style={{ boxShadow: `inset 0 0 30px ${loyaltyVisual.glowColor}` }}
        />
      )}

      {/* Signature edition foil */}
      {isSignature && (
        <div
          className="absolute inset-0 pointer-events-none z-[6] mix-blend-color-dodge opacity-40"
          style={{
            background: 'linear-gradient(115deg, transparent 20%, rgba(240,171,252,0.6) 35%, rgba(103,232,249,0.6) 50%, rgba(253,230,138,0.6) 65%, transparent 80%)',
            backgroundSize: '250% 250%',
            animation: 'signatureFoil 4s ease infinite',
          }}
        />
      )}

      {isShiny && (
        <div className="absolute inset-0 tex-stardust opacity-60 mix-blend-color-dodge animate-pulse motion-reduce:animate-none pointer-events-none z-20" />
      )}
      {isShiny && (
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-30 mix-blend-overlay" />
      )}
      {isShiny && (
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-300/40 blur-3xl rounded-full pointer-events-none z-10 mix-blend-screen" />
      )}
      
      {/* Holographic sheen (Epic+, Shiny): follows the pointer / device tilt */}
      {hasHolo && <div aria-hidden className={clsx('card-holo z-[35]', isShiny ? 'card-holo--Shiny' : `card-holo--${rarityKey}`)} />}

      {/* Legendary: periodic light sweep across the whole card */}
      {useRarityFrame && rarityKey === 'Legendary' && (
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none z-[36]">
          <div className="card-sweep" />
        </div>
      )}

      {/* Corner gems set into the frame (Rare and above) */}
      {useRarityFrame && isHighRarity && (
        <>
          <CornerGem rarity={rarityKey} className="top-[3px] left-[3px]" />
          <CornerGem rarity={rarityKey} className="top-[3px] right-[3px]" />
          <CornerGem rarity={rarityKey} className="bottom-[3px] left-[3px]" />
          <CornerGem rarity={rarityKey} className="bottom-[3px] right-[3px]" />
        </>
      )}

      {/* Loyalty ring (trusted+), inside the rarity frame */}
      {loyaltyBorder && !fatigued && (
        <div aria-hidden className={clsx('absolute inset-0 rounded-[7px] border-2 pointer-events-none z-[45]', loyaltyBorder)} />
      )}

      {/* Top Banner: Name, Rarity, and Loyalty Badge */}
      <div
        className={clsx("relative z-10 bg-black/60 py-2 flex justify-between items-center border-b", useRarityFrame && isHighRarity ? "px-4" : "px-3")}
        style={{ borderBottomColor: fatigued ? 'rgba(255,255,255,0.2)' : RARITY_ACCENT[rarityKey] }}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {loyaltyVisual.badgeIcon && (
            <span className="text-sm flex-shrink-0" title={`${LOYALTY_VISUALS[tier]?.badgeColor ? tier.replace('_', ' ') : ''}`}>
              {loyaltyVisual.badgeIcon}
            </span>
          )}
          <h3 className="font-bold truncate text-sm">{name}</h3>
        </div>
        <span
          className={clsx(
            "flex items-center gap-1 flex-shrink-0 text-xs font-semibold ml-2 pl-1 pr-1.5 py-0.5 rounded-sm border",
            RARITY_TAG[rarityKey]
          )}
          title={isShiny ? `${rarity} · Shiny` : rarity}
        >
          <RarityGem rarity={rarityKey} size={13} title="" />
          {rarity}
          {isShiny && <span className="text-[10px] leading-none text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.9)]" aria-label="Shiny">✦</span>}
        </span>
      </div>

      {/* Main Image */}
      <div className="relative z-10 w-full h-36 bg-black flex items-center justify-center p-2 flex-shrink-0">
        <div
          className="w-full h-full rounded-md overflow-hidden relative"
          style={{ boxShadow: `0 0 0 2px ${fatigued ? 'rgba(255,255,255,0.1)' : RARITY_ACCENT[rarityKey]}` }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={githubUsername} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">No Image</div>
          )}
          {isSignature && (
            <>
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-[0.2em] text-slate-900 bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-amber-200 shadow">
                Signature
              </div>
              <div
                className="absolute bottom-1 right-2 text-xl text-white/90 -rotate-6 pointer-events-none"
                style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
              >
                {githubUsername}
              </div>
            </>
          )}
          {quantity !== undefined && quantity > 1 && (
            <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full border border-blue-400">
              x{quantity}
            </div>
          )}
        </div>
      </div>

      {/* Flavor Text / Bio */}
      <div className="relative z-10 flex-1 p-3 bg-gradient-to-t from-black/80 to-transparent min-h-0 flex flex-col">
        <div className="mb-1.5 flex-shrink-0">
          <span className={clsx(
            "inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border",
            CORE_LANGUAGES.includes(primaryLanguage)
              ? "bg-indigo-900/50 border-indigo-500/50 text-indigo-200"
              : "bg-slate-800/50 border-slate-600/50 text-slate-400"
          )} title={CORE_LANGUAGES.includes(primaryLanguage) ? "Core Combat Type" : "Treated as Neutral in combat"}>
            {primaryLanguage} {CORE_LANGUAGES.includes(primaryLanguage) ? '' : '(Neutral)'}
          </span>
        </div>
        <p className="text-[11px] italic text-stone-300 line-clamp-2 leading-relaxed tracking-wide font-serif">
          &quot;{flavorText}&quot;
        </p>
      </div>

      {/* Stamina Bar */}
      {currentStamina !== undefined && (
        <div className={clsx("relative z-10 px-3 pt-2 pb-2 text-xs border-t", currentStamina < 60 ? 'bg-black/90 border-yellow-500/30' : 'bg-black/80 border-white/10')}>
          <div className="flex justify-between items-center mb-1.5">
            <span className={clsx("font-bold uppercase tracking-wider text-[10px]", currentStamina < 60 ? 'text-yellow-500' : 'text-slate-400')}>
              {currentStamina === 0 ? 'Exhausted' : currentStamina < 60 ? 'Fatigued' : 'Stamina'}
            </span>
            <span className={clsx("font-mono font-bold text-[11px]", currentStamina < 60 ? 'text-red-400' : currentStamina < 80 ? 'text-yellow-400' : 'text-green-400')}>{currentStamina}/100</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden shadow-inner">
            <div 
              className={clsx("h-full transition-all duration-1000", currentStamina < 40 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : currentStamina < 80 ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' : 'bg-green-500')}
              style={{ width: `${Math.max(0, Math.min(100, currentStamina))}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats area */}
      <div className="relative z-10 border-t border-white/20 bg-black/80 p-3 grid grid-cols-3 gap-2 text-center items-center flex-shrink-0">
        <div className="flex flex-col items-center min-w-0">
          <Sword size={16} weight="fill" className={multiplier < 1 ? "text-red-600 mb-1" : "text-red-400 mb-1"} />
          <span className={clsx("font-bold text-sm", multiplier < 1 && "text-red-500", isEternal && "text-cyan-300")}>{displayAtk}</span>
        </div>
        <div className="flex flex-col items-center min-w-0 border-x border-white/20">
          <Shield size={16} weight="fill" className={multiplier < 1 ? "text-blue-600 mb-1" : "text-blue-400 mb-1"} />
          <span className={clsx("font-bold text-sm", multiplier < 1 && "text-blue-500", isEternal && "text-cyan-300")}>{displayDef}</span>
        </div>
        <div className="flex flex-col items-center min-w-0">
          <Heart size={16} weight="fill" className="text-green-400 mb-1" />
          <span className={clsx("font-bold text-sm", isEternal && "text-cyan-300")}>{hp}</span>
        </div>
      </div>

    </>
  );

  return (
    disableLink ? (
      <motion.div
        whileHover={{ scale: 1.05, translateY: -2 }}
        className={cardClasses}
        style={cardStyle}
        {...holoHandlers}
      >
        {cardContent}
      </motion.div>
    ) : (
      <motion.a
        href={`https://github.com/${githubUsername}`}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.05, translateY: -2 }}
        className={cardClasses}
        style={cardStyle}
        {...holoHandlers}
      >
        {cardContent}
      </motion.a>
    )
  );
}
