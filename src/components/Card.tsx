import React from 'react';
import { Shield, Sword, Heart } from '@phosphor-icons/react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { calculateCurrentStamina, getStaminaMultiplier } from '@/lib/staminaUtils';

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
};

const RARITY_COLORS: Record<string, string> = {
  Common: 'border-slate-400 shadow-slate-400/50',
  Uncommon: 'border-green-400 shadow-green-400/50',
  Rare: 'border-blue-500 shadow-blue-500/60',
  Epic: 'border-purple-500 shadow-purple-500/70',
  Legendary: 'border-yellow-400 shadow-yellow-400/80',
};

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
}: CardProps) {
  
  const borderGlow = RARITY_COLORS[rarity] || RARITY_COLORS.Common;
  const bgGradient = LANG_COLORS[primaryLanguage] || LANG_COLORS.Unknown;

  const currentStamina = stamina !== undefined ? calculateCurrentStamina(stamina, lastUsedAt || new Date(), inActiveTeam || false) : undefined;
  const multiplier = currentStamina !== undefined ? getStaminaMultiplier(currentStamina) : 1;
  
  const displayAtk = Math.floor(atk * multiplier);
  const displayDef = Math.floor(def * multiplier);

  const cardClasses = clsx(
    "relative w-64 h-96 rounded-xl border-4 overflow-hidden bg-slate-900 text-white flex flex-col font-sans transition-shadow duration-300 group",
    borderGlow,
    isShiny ? "shadow-[0_0_30px_rgba(255,255,255,0.8)] border-white/80" : "shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
  );

  return (
    disableLink ? (
      <motion.div
        whileHover={{ scale: 1.05, translateY: -2 }}
        className={cardClasses}
      >
      {/* Background Gradient based on Lang */}
      <div className={clsx("absolute inset-0 bg-gradient-to-br opacity-50", bgGradient)} />
      {isShiny && (
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-60 mix-blend-color-dodge animate-pulse pointer-events-none z-20" />
      )}
      {isShiny && (
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-30 mix-blend-overlay" />
      )}
      {isShiny && (
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-300/40 blur-3xl rounded-full pointer-events-none z-10 mix-blend-screen" />
      )}
      
      {/* Top Banner: Name and Rarity */}
      <div className="relative z-10 bg-black/60 p-2 flex justify-between items-center border-b border-white/20">
        <h3 className="font-bold truncate text-sm flex-1">{name}</h3>
        <span className="text-xs font-semibold ml-2 px-1.5 py-0.5 rounded-sm bg-white/10">{rarity}</span>
      </div>

      {/* Main Image */}
      <div className="relative z-10 w-full h-40 bg-black flex items-center justify-center p-2">
        <div className="w-full h-full rounded-md overflow-hidden ring-2 ring-white/10 relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt={githubUsername} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">No Image</div>
          )}
          {quantity !== undefined && quantity > 1 && (
            <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full border border-blue-400">
              x{quantity}
            </div>
          )}
        </div>
      </div>

      {/* Flavor Text / Bio */}
      <div className="relative z-10 flex-1 p-3 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-xs italic text-stone-300 line-clamp-4 leading-relaxed tracking-wide font-serif">
          &quot;{flavorText}&quot;
        </p>
      </div>

      {/* Stamina Bar */}
      {currentStamina !== undefined && (
        <div className="relative z-10 bg-black/80 px-3 pt-2 pb-1 text-xs">
          <div className="flex justify-between items-center mb-1">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Stamina</span>
            <span className={clsx("font-mono text-[10px]", currentStamina < 60 ? 'text-red-400' : currentStamina < 80 ? 'text-yellow-400' : 'text-green-400')}>{currentStamina}/100</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={clsx("h-full transition-all duration-1000", currentStamina < 40 ? 'bg-red-500' : currentStamina < 80 ? 'bg-yellow-500' : 'bg-green-500')}
              style={{ width: `${Math.max(0, Math.min(100, currentStamina))}%` }}
            />
          </div>
          {currentStamina === 0 && <div className="text-red-500 text-[9px] font-black tracking-widest text-center mt-1 animate-pulse uppercase">Exhausted</div>}
        </div>
      )}

      {/* Stats area */}
      <div className="relative z-10 border-t border-white/20 bg-black/80 p-3 grid grid-cols-3 gap-2 text-center items-center">
        <div className="flex flex-col items-center min-w-0">
          <Sword size={16} weight="fill" className={multiplier < 1 ? "text-red-600 mb-1" : "text-red-400 mb-1"} />
          <span className={clsx("font-bold text-sm", multiplier < 1 && "text-red-500")}>{displayAtk}</span>
        </div>
        <div className="flex flex-col items-center min-w-0 border-x border-white/20">
          <Shield size={16} weight="fill" className={multiplier < 1 ? "text-blue-600 mb-1" : "text-blue-400 mb-1"} />
          <span className={clsx("font-bold text-sm", multiplier < 1 && "text-blue-500")}>{displayDef}</span>
        </div>
        <div className="flex flex-col items-center min-w-0">
          <Heart size={16} weight="fill" className="text-green-400 mb-1" />
          <span className="font-bold text-sm">{hp}</span>
        </div>
      </div>
      </motion.div>
    ) : (
      <motion.a
        href={`https://github.com/${githubUsername}`}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.05, translateY: -2 }}
        className={cardClasses}
      >
        {/* Background Gradient based on Lang */}
        <div className={clsx("absolute inset-0 bg-gradient-to-br opacity-50", bgGradient)} />
        {isShiny && (
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-60 mix-blend-color-dodge animate-pulse pointer-events-none z-20" />
        )}
        {isShiny && (
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-30 mix-blend-overlay" />
        )}
        {isShiny && (
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-300/40 blur-3xl rounded-full pointer-events-none z-10 mix-blend-screen" />
        )}
        
        {/* Top Banner: Name and Rarity */}
        <div className="relative z-10 bg-black/60 p-2 flex justify-between items-center border-b border-white/20">
          <h3 className="font-bold truncate text-sm flex-1">{name}</h3>
          <span className="text-xs font-semibold ml-2 px-1.5 py-0.5 rounded-sm bg-white/10">{rarity}</span>
        </div>

        {/* Main Image */}
        <div className="relative z-10 w-full h-40 bg-black flex items-center justify-center p-2">
          <div className="w-full h-full rounded-md overflow-hidden ring-2 ring-white/10 relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={githubUsername} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">No Image</div>
            )}
            {quantity !== undefined && quantity > 1 && (
              <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full border border-blue-400">
                x{quantity}
              </div>
            )}
          </div>
        </div>

        {/* Flavor Text / Bio */}
        <div className="relative z-10 flex-1 p-3 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-xs italic text-stone-300 line-clamp-4 leading-relaxed tracking-wide font-serif">
            &quot;{flavorText}&quot;
          </p>
        </div>

        {/* Stamina Bar */}
        {currentStamina !== undefined && (
          <div className="relative z-10 bg-black/80 px-3 pt-2 pb-1 text-xs">
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Stamina</span>
              <span className={clsx("font-mono text-[10px]", currentStamina < 60 ? 'text-red-400' : currentStamina < 80 ? 'text-yellow-400' : 'text-green-400')}>{currentStamina}/100</span>
            </div>
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={clsx("h-full transition-all duration-1000", currentStamina < 40 ? 'bg-red-500' : currentStamina < 80 ? 'bg-yellow-500' : 'bg-green-500')}
                style={{ width: `${Math.max(0, Math.min(100, currentStamina))}%` }}
              />
            </div>
            {currentStamina === 0 && <div className="text-red-500 text-[9px] font-black tracking-widest text-center mt-1 animate-pulse uppercase">Exhausted</div>}
          </div>
        )}

        {/* Stats area */}
        <div className="relative z-10 border-t border-white/20 bg-black/80 p-3 grid grid-cols-3 gap-2 text-center items-center">
          <div className="flex flex-col items-center min-w-0">
            <Sword size={18} weight="fill" className={multiplier < 1 ? "text-red-600 mb-1" : "text-red-400 mb-1"} />
            <span className={clsx("font-bold text-sm", multiplier < 1 && "text-red-500")}>{displayAtk}</span>
          </div>
          <div className="flex flex-col items-center min-w-0 border-x border-white/20">
            <Shield size={18} weight="fill" className={multiplier < 1 ? "text-blue-600 mb-1" : "text-blue-400 mb-1"} />
            <span className={clsx("font-bold text-sm", multiplier < 1 && "text-blue-500")}>{displayDef}</span>
          </div>
          <div className="flex flex-col items-center min-w-0">
            <Heart size={18} weight="fill" className="text-green-400 mb-1" />
            <span className="font-bold text-sm">{hp}</span>
          </div>
        </div>
      </motion.a>
    )
  );
}
