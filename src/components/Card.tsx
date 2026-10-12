import React from 'react';
import { Shield, Sword, Heart } from '@phosphor-icons/react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { calculateCurrentStamina, getStaminaMultiplier } from '@/lib/staminaUtils';
import { useHoloGyro } from '@/lib/holoTilt';
import { cardPassive } from '@/lib/battleConfig';
import { cardTitle, languageStyle, rarityLevel, serialHash, RARITY_ORDER } from '@/lib/cardVisuals';

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

const LOYALTY_VISUALS: Record<string, { ringColor?: string; glowColor?: string; badgeIcon?: string }> = {
  none: {},
  veteran: { badgeIcon: '⭐' },
  trusted: { ringColor: 'rgba(234,179,8,0.7)', glowColor: 'rgba(251,191,36,0.15)', badgeIcon: '🛡️' },
  reliable: { ringColor: 'rgba(249,115,22,0.7)', glowColor: 'rgba(249,115,22,0.2)', badgeIcon: '🔥' },
  legendary_bond: { ringColor: 'rgba(236,72,153,0.7)', glowColor: 'rgba(236,72,153,0.25)', badgeIcon: '💎' },
  eternal: { ringColor: 'rgba(34,211,238,0.8)', glowColor: 'rgba(6,182,212,0.3)', badgeIcon: '♾️' },
};

const SPARKS: [number, number, number][] = [[18, 22, 0], [78, 14, 0.7], [64, 58, 1.3], [12, 64, 1.9], [86, 80, 0.4]];

/** 3D tilt + holo light following the mouse (touch devices use the shared gyro vars instead). */
function trackCardPointer(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === 'touch') return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.dataset.live = '';
  el.style.setProperty('--ry', `${((x - 0.5) * 16).toFixed(2)}deg`);
  el.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`);
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
}

function resetCardPointer(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  delete el.dataset.live;
  for (const p of ['--rx', '--ry', '--mx', '--my']) el.style.removeProperty(p);
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
  edition,
}: CardProps) {
  const isSignature = edition === 'signature';
  const tier = loyaltyTier || 'none';
  const loyalty = LOYALTY_VISUALS[tier] || {};
  const isEternal = tier === 'eternal';
  const isLegendaryBond = tier === 'legendary_bond';

  const rarityKey = (RARITY_ORDER as readonly string[]).includes(rarity) ? rarity : 'Common';
  const level = rarityLevel(rarityKey);
  const lang = languageStyle(primaryLanguage);
  const passive = cardPassive(primaryLanguage, rarityKey);
  const hash = serialHash(githubUsername);

  const currentStamina = stamina !== undefined ? calculateCurrentStamina(stamina, lastUsedAt || new Date(), inActiveTeam || false) : undefined;
  const multiplier = currentStamina !== undefined ? getStaminaMultiplier(currentStamina) : 1;
  const fatigued = multiplier < 1;
  const exhausted = currentStamina === 0;
  const displayAtk = Math.floor(atk * multiplier);
  const displayDef = Math.floor(def * multiplier);

  // Fatigue colours and the Signature foil take over the rarity material
  const useRarityFrame = !fatigued && !isSignature;
  const hasHolo = (isShiny || isSignature || level >= 4) && !exhausted;
  useHoloGyro(hasHolo);

  const cardClasses = clsx(
    'gg-card relative block w-64 h-[410px] flex-shrink-0 text-left font-sans select-none',
    useRarityFrame && `gg--${rarityKey}`,
    useRarityFrame && isShiny && 'gg--shiny',
    isSignature && !fatigued && 'gg--signature',
    fatigued && (exhausted ? 'gg--exhausted' : 'gg--fatigued'),
  );
  const cardStyle = { '--gg-lang': lang.color, '--gg-lang-ink': lang.ink } as React.CSSProperties;

  const graph = Array.from({ length: 5 }, (_, i) => (
    <React.Fragment key={i}>
      {i > 0 && <s />}
      <i data-on={i < level ? '' : undefined} />
    </React.Fragment>
  ));

  const cardContent = (
    <>
      <div aria-hidden className="gg-shadow" />
      <div className="gg-tilt">
        <div className="gg-frame gg-chamfer">
          <div className="gg-body gg-chamfer">
            {/* Loyalty: Eternal holo wash, Legendary Bond particles, inner glow */}
            {isEternal && (
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none z-[5]"
                style={{
                  background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(168,85,247,0.15) 25%, rgba(236,72,153,0.15) 50%, rgba(251,191,36,0.15) 75%, rgba(6,182,212,0.15) 100%)',
                  backgroundSize: '400% 400%',
                  animation: 'holoShift 6s ease infinite',
                }}
              />
            )}
            {isLegendaryBond && (
              <div aria-hidden className="absolute inset-0 pointer-events-none z-[5] overflow-hidden">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-1 h-1 rounded-full bg-pink-400/60"
                    style={{ left: `${15 + i * 14}%`, animation: `particleFloat ${2 + i * 0.4}s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }}
                  />
                ))}
              </div>
            )}
            {loyalty.glowColor && !fatigued && (
              <div aria-hidden className="absolute inset-0 pointer-events-none z-[4]" style={{ boxShadow: `inset 0 0 30px ${loyalty.glowColor}` }} />
            )}

            {/* Header: name, @login · title, serial hash */}
            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  {loyalty.badgeIcon && (
                    <span className="text-sm flex-shrink-0" title={tier.replace('_', ' ')}>{loyalty.badgeIcon}</span>
                  )}
                  <h3 className="gg-name">{name}</h3>
                </div>
                <div className="gg-sub">
                  @{githubUsername} · <em>{isSignature ? 'Signature' : cardTitle(primaryLanguage, rarityKey)}</em>
                </div>
              </div>
              <div className="gg-serial" title="Card serial">{isSignature ? '1/1' : `#${hash}`}</div>
            </div>

            {/* Art: avatar in a rarity-coloured window, language emblem, rarity commit graph */}
            <div className="gg-art gg-chamfer relative z-10">
              <div className="gg-pic gg-chamfer">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={githubUsername} loading="lazy" draggable={false} />
                ) : (
                  <div className="absolute inset-0 grid place-items-center font-display text-5xl text-white/30">{(name || '?')[0]}</div>
                )}
                {useRarityFrame && rarityKey === 'Legendary' && <div aria-hidden className="gg-rays" />}
                {isShiny && !isSignature && <span className="gg-stamp">SHINY</span>}
                {isSignature && (
                  <>
                    <span className="gg-stamp">SIGNATURE</span>
                    <span className="absolute z-[4] right-2.5 bottom-3 -rotate-[8deg] font-script text-3xl text-white pointer-events-none" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
                      {githubUsername}
                    </span>
                  </>
                )}
                {quantity !== undefined && quantity > 1 && (
                  <span className="absolute z-[4] left-2 bottom-2 px-1.5 py-0.5 font-mono font-extrabold text-[11px] text-white bg-black/70 border border-white/25">
                    x{quantity}
                  </span>
                )}
              </div>
              <div className="gg-hex absolute z-[3] top-[7px] left-[7px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]" title={primaryLanguage}>{lang.abbr}</div>
              <div className="gg-graph" title={rarityKey} aria-label={`${rarityKey} (${level} of 5)`}>{graph}</div>
            </div>

            {/* Combat passive */}
            <div className="relative z-10 flex gap-2 items-start mt-[18px]">
              <div className="gg-hex gg-hex--sm">{lang.abbr}</div>
              <div className="min-w-0">
                <div className="gg-passive-name">{passive.name} <span>· {primaryLanguage}</span></div>
                <div className="gg-passive-desc">{passive.desc}</div>
              </div>
            </div>

            {/* Flavor text as a commit message */}
            <div className="gg-flavor relative z-10">
              <div className="gg-flavor-hash">commit {hash}</div>
              <q>{flavorText}</q>
            </div>

            {/* Stamina */}
            {currentStamina !== undefined && (
              <div className="relative z-10 mt-2">
                <div className="flex justify-between items-center mb-1 font-mono text-[10px] font-bold uppercase tracking-wider">
                  <span className={currentStamina < 60 ? 'text-yellow-500' : 'text-slate-400'}>
                    {exhausted ? 'Exhausted' : currentStamina < 60 ? 'Fatigued' : 'Stamina'}
                  </span>
                  <span className={currentStamina < 60 ? 'text-red-400' : currentStamina < 80 ? 'text-yellow-400' : 'text-green-400'}>{currentStamina}/100</span>
                </div>
                <div className="w-full h-1.5 bg-black/60 overflow-hidden">
                  <div
                    className={clsx('h-full transition-all duration-1000', currentStamina < 40 ? 'bg-red-500' : currentStamina < 80 ? 'bg-yellow-500' : 'bg-green-500')}
                    style={{ width: `${Math.max(0, Math.min(100, currentStamina))}%` }}
                  />
                </div>
              </div>
            )}

            {/* ATK / DEF / HP */}
            <div className="relative z-10 grid grid-cols-3 gap-[5px] mt-2">
              <div className="gg-stat gg-chamfer" style={{ '--sc': '#ff5a5f' } as React.CSSProperties} title="Attack">
                <Sword size={14} weight="fill" color="#ff5a5f" />
                <b className={clsx(fatigued && 'text-red-400', isEternal && 'text-cyan-300')}>{displayAtk}</b>
              </div>
              <div className="gg-stat gg-chamfer" style={{ '--sc': '#4f9dff' } as React.CSSProperties} title="Defense">
                <Shield size={14} weight="fill" color="#4f9dff" />
                <b className={clsx(fatigued && 'text-blue-300', isEternal && 'text-cyan-300')}>{displayDef}</b>
              </div>
              <div className="gg-stat gg-chamfer" style={{ '--sc': '#3ddc97' } as React.CSSProperties} title="HP">
                <Heart size={14} weight="fill" color="#3ddc97" />
                <b className={clsx(isEternal && 'text-cyan-300')}>{hp}</b>
              </div>
            </div>

            <div className="gg-foot relative z-10">
              <span>GITGACHA</span>
              <b>{isSignature ? 'SIGNATURE' : rarityKey.toUpperCase()}{isShiny && !isSignature ? ' ✦' : ''}</b>
            </div>

            {/* Effects */}
            {hasHolo && <div aria-hidden className="gg-holo" />}
            {useRarityFrame && rarityKey === 'Legendary' && <div aria-hidden className="gg-sweep" />}
            {!exhausted && (level >= 4 || isShiny || isSignature) && (
              <div aria-hidden className="gg-sparks">
                {SPARKS.map(([x, y, t], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${t}s` }} />)}
              </div>
            )}
            {loyalty.ringColor && !fatigued && (
              <div aria-hidden className="absolute inset-0 pointer-events-none z-[45]" style={{ boxShadow: `inset 0 0 0 2px ${loyalty.ringColor}` }} />
            )}
          </div>
        </div>

        {/* Gems set into the chamfers (Rare and above) */}
        {useRarityFrame && level >= 3 && (
          <>
            <span aria-hidden className="gg-gem top-[5px] left-[5px]" />
            <span aria-hidden className="gg-gem top-[5px] right-[5px]" />
            <span aria-hidden className="gg-gem bottom-[5px] left-[5px]" />
            <span aria-hidden className="gg-gem bottom-[5px] right-[5px]" />
          </>
        )}
      </div>
    </>
  );

  const pointer = { onPointerMove: trackCardPointer, onPointerLeave: resetCardPointer };

  return disableLink ? (
    <motion.div whileHover={{ scale: 1.04, translateY: -2 }} className={cardClasses} style={cardStyle} {...pointer}>
      {cardContent}
    </motion.div>
  ) : (
    <motion.a
      href={`https://github.com/${githubUsername}`}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ scale: 1.04, translateY: -2 }}
      className={cardClasses}
      style={cardStyle}
      aria-label={`${name}, ${rarityKey}${isShiny ? ' Shiny' : ''}${isSignature ? ' Signature' : ''}: open GitHub profile`}
      {...pointer}
    >
      {cardContent}
    </motion.a>
  );
}
