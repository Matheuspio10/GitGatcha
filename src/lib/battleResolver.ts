import {
  COMBAT_LANGUAGES,
  defMitigation,
  getLoyaltyBonuses,
  isCombatLanguage,
  MATCHUP_TURN_CAP,
  MOMENTUM_BONUS_PER_STACK,
  PASSIVE,
  PASSIVE_RARITY_MULTIPLIER,
  SYNERGY,
  TYPE_ADVANTAGE_MULTIPLIER,
  TYPE_ADVANTAGES,
  TYPE_DISADVANTAGE_MULTIPLIER,
} from './battleConfig';
import { trainingMultiplier } from './training';

/** A combat language (see COMBAT_LANGUAGES), 'Neutral', or the special 'Legendary' pack type. */
export type CardType = (typeof COMBAT_LANGUAGES)[number] | 'Neutral' | 'Legendary';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface BattleCard {
  id: string; // This will map to UserCard.id in practice for user cards, or Card.id for random defenders
  name: string;
  atk: number;
  def: number;
  hp: number;
  maxHp: number;
  stamina: number;
  rarity: Rarity;
  primaryLanguage: string | null;
  type: CardType;
  avatarUrl?: string | null;
  loyaltyTier?: string;
  /** Training level of the player's copy (training.ts); 0 for computer cards. */
  trainingLevel?: number;

  // Momentum & Tracking
  consecutiveWins?: number;
  momentumStacks?: number;
  statsDealtDamage?: number;
  statsTakenDamage?: number;
  statsPassivesTriggered?: number;
  statsCritsLanded?: number;
  statsMomentumAchieved?: boolean;
}

export interface BattleLogEvent {
  type: 'damage' | 'passive' | 'synergy' | 'defeat' | 'type_advantage' | 'enter_field' | 'draw' | 'battle_start' | 'battle_end';
  cardId?: string;
  targetId?: string;
  value?: number;
  message: string;
}

export interface TurnLog {
  turnNumber: number;
  cCardId: string;
  dCardId: string;
  cHpStart: number;
  dHpStart: number;
  cHpEnd: number;
  dHpEnd: number;
  events: BattleLogEvent[];
}

export interface BattleResult {
  winner: 'CHALLENGER' | 'DEFENDER';
  log: TurnLog[];
  challengerTeamState: BattleCard[];
  defenderTeamState: BattleCard[];
}

export interface ResolveOptions {
  /** Random source in [0, 1). Defaults to Math.random; the balance simulator passes a seeded one. */
  rng?: () => number;
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

export function getCardType(card: { primaryLanguage?: string | null; rarity?: string; pack?: string }): CardType {
  // 'Legendary' type is reserved for a future "GitHub OGs" pack (Card has no pack column yet).
  if (card.rarity === 'Legendary' && card.pack === 'GitHub OGs') {
    return 'Legendary';
  }
  return isCombatLanguage(card.primaryLanguage) ? card.primaryLanguage : 'Neutral';
}

function getRarityMultiplier(rarity: string): number {
  return PASSIVE_RARITY_MULTIPLIER[rarity] ?? 1.0;
}

/** Share of the team's total max HP still standing (cards at or below 0 HP count as 0). */
export function remainingHpFraction(team: BattleCard[]): number {
  const max = team.reduce((acc, c) => acc + Math.max(0, c.maxHp), 0);
  if (max <= 0) return 0;
  const left = team.reduce((acc, c) => acc + Math.max(0, Math.min(c.hp, c.maxHp)), 0);
  return left / max;
}

/**
 * The single tie rule for every way a battle can end.
 *
 * - One side still has cards and the other doesn't: the side with cards wins.
 * - Otherwise (both last cards went down together, or the global turn limit
 *   stopped the fight with both sides standing): the team with the higher
 *   remaining HP % wins; an exact tie goes to the DEFENDER.
 */
export function decideBattleWinner(
  cTeam: BattleCard[],
  dTeam: BattleCard[],
  cIdx: number,
  dIdx: number
): 'CHALLENGER' | 'DEFENDER' {
  const cAlive = cIdx < cTeam.length;
  const dAlive = dIdx < dTeam.length;
  if (cAlive && !dAlive) return 'CHALLENGER';
  if (dAlive && !cAlive) return 'DEFENDER';
  return remainingHpFraction(cTeam) > remainingHpFraction(dTeam) ? 'CHALLENGER' : 'DEFENDER';
}

// ---------------------------------------------------------
// Type Matchups (1.5x / 0.75x) — chart in battleConfig.TYPE_ADVANTAGES
// ---------------------------------------------------------
export function getTypeMultiplier(attackerType: CardType, defenderType: CardType): number {
  // CSS loses to every type (deals 0.75x except vs CSS/Legendary/Neutral)
  if (attackerType === 'CSS') {
    if (defenderType !== 'CSS' && defenderType !== 'Legendary' && defenderType !== 'Neutral') {
      return TYPE_DISADVANTAGE_MULTIPLIER;
    }
    return 1.0;
  }
  if (attackerType === 'Neutral' || attackerType === 'Legendary' || defenderType === 'Neutral' || defenderType === 'Legendary') {
    return 1.0;
  }
  if (TYPE_ADVANTAGES[attackerType]?.includes(defenderType)) return TYPE_ADVANTAGE_MULTIPLIER;
  if (TYPE_ADVANTAGES[defenderType]?.includes(attackerType)) return TYPE_DISADVANTAGE_MULTIPLIER;
  return 1.0;
}

/** Raw hit before passives: ATK × K / (K + DEF), never below 1. */
function mitigatedDamage(atk: number, def: number): number {
  return Math.max(1, Math.floor(atk * (1 - defMitigation(def))));
}

/** Per-card battle state that must not leak into the returned team state. */
interface CardState {
  pySynergy: number;
  rustSynergy: number;
  jsSynergy: number;
  goSynergy: boolean;
  ironShield: boolean;
  phpSuppressUsed: boolean;
  dartReloadUsed: boolean;
}

// ---------------------------------------------------------
// Core Resolver Function
// ---------------------------------------------------------
export function resolve3v3Battle(cTeamInitial: BattleCard[], dTeamInitial: BattleCard[], options: ResolveOptions = {}): BattleResult {
  const rng = options.rng ?? Math.random;

  // Deep copy teams
  const cTeam = JSON.parse(JSON.stringify(cTeamInitial)) as BattleCard[];
  const dTeam = JSON.parse(JSON.stringify(dTeamInitial)) as BattleCard[];

  const state = new Map<BattleCard, CardState>();
  [...cTeam, ...dTeam].forEach(c => state.set(c, {
    pySynergy: 0, rustSynergy: 0, jsSynergy: 0, goSynergy: false,
    ironShield: false, phpSuppressUsed: false, dartReloadUsed: false,
  }));
  const st = (c: BattleCard) => state.get(c)!;

  // Apply loyalty and training bonuses FIRST (permanent multipliers on base stats)
  const applyLoyaltyBonuses = (team: BattleCard[]) => {
    team.forEach(c => {
      const bonuses = getLoyaltyBonuses(c.loyaltyTier || 'none');
      const trained = trainingMultiplier(c.trainingLevel, c.rarity);
      c.atk = Math.floor(c.atk * bonuses.atkMult * trained);
      c.def = Math.floor(c.def * bonuses.defMult * trained);
      c.hp = Math.floor(c.hp * bonuses.hpMult * trained);
      c.maxHp = Math.floor(c.maxHp * bonuses.hpMult * trained);
    });
  };

  applyLoyaltyBonuses(cTeam);
  applyLoyaltyBonuses(dTeam);

  // Apply stamina penalty to ATK and DEF (after loyalty)
  const applyStaminaPenalty = (team: BattleCard[]) => {
    team.forEach(c => {
      let multiplier = 1.0;
      if (c.stamina <= 20) multiplier = 0.40;
      else if (c.stamina <= 40) multiplier = 0.60;
      else if (c.stamina <= 60) multiplier = 0.75;
      else if (c.stamina <= 80) multiplier = 0.90;

      c.atk = Math.floor(c.atk * multiplier);
      c.def = Math.floor(c.def * multiplier);
    });
  };

  applyStaminaPenalty(cTeam);
  applyStaminaPenalty(dTeam);

  const log: TurnLog[] = [];
  let turnNumber = 1;

  let cIdx = 0;
  let dIdx = 0;

  // Synergies initialization
  const applySynergies = (team: BattleCard[], isChallenger: boolean) => {
    const events: BattleLogEvent[] = [];
    const side = isChallenger ? 'Challenger' : 'Defender';
    const typeCounts: Record<string, number> = {};
    team.forEach(c => {
      typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
    });

    // Check mixed team (all 3 unique)
    if (Object.keys(typeCounts).length === 3) {
      team.forEach(c => c.atk = Math.floor(c.atk * (1 + SYNERGY.mixedTeamAtk)));
      events.push({ type: 'synergy', message: `${side} Mixed Team synergy! +${Math.round(SYNERGY.mixedTeamAtk * 100)}% ATK to all.` });
    }

    // Jupyter Notebook runs a Python kernel: it counts as Python for the Python Synergy
    const pythonCount = (typeCounts['Python'] || 0) + (typeCounts['Jupyter Notebook'] || 0);

    // Check pairs/triples
    const synergyCounts: Record<string, number> = { Python: pythonCount, Rust: typeCounts['Rust'] || 0, JavaScript: typeCounts['JavaScript'] || 0, Go: typeCounts['Go'] || 0 };
    Object.keys(synergyCounts).forEach(type => {
      const count = synergyCounts[type];
      if (count < 2) return;
      const mult = count === 3 ? 2 : 1;
      events.push({ type: 'synergy', message: `${side} ${type} Synergy (x${count}) activated!` });
      if (type === 'Python') team.forEach(c => st(c).pySynergy = SYNERGY.pythonRegenAtkPct * mult);
      if (type === 'Rust') team.forEach(c => st(c).rustSynergy = SYNERGY.rustDamageReduction * mult);
      if (type === 'JavaScript') team.forEach(c => st(c).jsSynergy = SYNERGY.jsCallbackChance * mult);
      if (type === 'Go') team.forEach(c => st(c).goSynergy = true); // Handled on Enter
    });

    // (The old "Big Tech + Indie Hacker" synergy stub was removed: cards don't
    // store which booster they came from, so it could never trigger.)

    return events;
  };

  const startEvents = [
    { type: 'battle_start' as const, message: 'Battle Started!' },
    ...applySynergies(cTeam, true),
    ...applySynergies(dTeam, false)
  ];

  log.push({
      turnNumber: 0,
      cCardId: '', dCardId: '', cHpStart: 0, dHpStart: 0, cHpEnd: 0, dHpEnd: 0,
      events: startEvents
  });

  const momentum = (c: BattleCard) => 1 + (c.momentumStacks || 0) * MOMENTUM_BONUS_PER_STACK;

  /** PHP @ Error Suppression: a knockout blow leaves it at 1 HP, once per battle. */
  const trySuppress = (card: BattleCard, logEvents: BattleLogEvent[]) => {
    if (card.type !== 'PHP' || card.hp > 0 || st(card).phpSuppressUsed) return;
    st(card).phpSuppressUsed = true;
    card.hp = PASSIVE.php.survivesAt;
    card.statsPassivesTriggered = (card.statsPassivesTriggered || 0) + 1;
    logEvents.push({ type: 'passive', cardId: card.id, message: `[PHP] ${card.name} @-suppressed a fatal error and survives with ${card.hp} HP!` });
  };

  /** On-entry states (Iron Shield). Runs for every entering card before any First Strike. */
  const enterField = (card: BattleCard, logEvents: BattleLogEvent[]) => {
      logEvents.push({ type: 'enter_field', cardId: card.id, message: `${card.name} enters the field!` });

      // Rust Iron Shield: blocks all damage until the end of this turn
      if (card.type === 'Rust') {
          st(card).ironShield = true;
          logEvents.push({ type: 'passive', cardId: card.id, message: `[Rust] ${card.name} gained Iron Shield (blocks first turn damage).` });
      }
  };

  /**
   * Go First Strike (or Go Synergy) of the cards entering this turn. Every
   * strike is computed before any lands, so two cards entering together hit
   * each other at the same time and the result doesn't depend on which side
   * is the challenger.
   */
  const resolveFirstStrikes = (entering: [BattleCard, BattleCard][], logEvents: BattleLogEvent[]) => {
      const strikes = entering
        .filter(([card]) => card.type === 'Go' || st(card).goSynergy)
        .map(([card, opponent]) => ({ card, opponent, dmg: mitigatedDamage(card.atk * momentum(card), opponent.def * momentum(opponent)) }));

      for (const { card, opponent, dmg } of strikes) {
          logEvents.push({ type: 'passive', cardId: card.id, message: `${card.name} strikes first on entry!` });
          if (st(opponent).ironShield) {
            logEvents.push({ type: 'passive', cardId: opponent.id, message: `Iron Shield blocked First Strike!` });
          } else {
             opponent.hp -= dmg;
             card.statsDealtDamage = (card.statsDealtDamage || 0) + dmg;
             opponent.statsTakenDamage = (opponent.statsTakenDamage || 0) + dmg;
             logEvents.push({ type: 'damage', cardId: card.id, targetId: opponent.id, value: dmg, message: `${card.name} dealt ${dmg} first strike damage.` });
          }
      }
      for (const { opponent } of strikes) trySuppress(opponent, logEvents);
  };

  /** Iron Shield only lasts for the turn the Rust card entered on. */
  const endShields = (...cards: BattleCard[]) => {
      for (const card of cards) st(card).ironShield = false;
  };

  /**
   * Damage `att` deals to `def` this turn (before the defender's shields and
   * caps), with the attacker's passives. `matchupTurn` starts at 0.
   */
  const attack = (att: BattleCard, def: BattleCard, matchupTurn: number, events: BattleLogEvent[]) => {
    const typeMult = getTypeMultiplier(att.type, def.type);
    if (typeMult > 1) events.push({ type: 'type_advantage', cardId: att.id, message: `${att.name} has Type Advantage!` });

    const rarityMult = getRarityMultiplier(att.rarity);
    let atkBonus = 1;
    let zeroDmg = false;
    let passive = false;
    let crit = false;

    // CSS Undefined Behavior (bad luck gets rarer on rarer cards)
    if (att.type === 'CSS') {
      if (rng() < PASSIVE.css.doubleChance * rarityMult) {
        atkBonus = 2; passive = true;
        events.push({ type: 'passive', cardId: att.id, message: `[CSS] ${att.name} double damage!` });
      } else if (rng() < PASSIVE.css.zeroChance / rarityMult) {
        zeroDmg = true;
        events.push({ type: 'passive', cardId: att.id, message: `[CSS] ${att.name} undefined behavior (0 damage)!` });
      }
    }

    // Ruby Last Stand
    if (att.type === 'Ruby' && att.hp < att.maxHp * PASSIVE.ruby.hpThreshold) {
      atkBonus *= PASSIVE.ruby.atkMult; passive = true;
      events.push({ type: 'passive', cardId: att.id, message: `[Ruby] Last stand active!` });
    }

    // Java JIT Warm-up: slow first turn, then ramps up during the matchup
    if (att.type === 'Java') {
      const ramp = matchupTurn === 0
        ? PASSIVE.java.firstTurnMult
        : 1 + Math.min(PASSIVE.java.maxBonus, PASSIVE.java.perTurn * matchupTurn);
      atkBonus *= ramp;
      if (matchupTurn === 1) events.push({ type: 'passive', cardId: att.id, message: `[Java] ${att.name}'s JIT is warming up...` });
      if (PASSIVE.java.perTurn * matchupTurn === PASSIVE.java.maxBonus) {
        passive = true;
        events.push({ type: 'passive', cardId: att.id, message: `[Java] ${att.name} is fully JIT-compiled! (+${Math.round(PASSIVE.java.maxBonus * 100)}% damage)` });
      }
    }

    // Shell Cron Job: every Nth turn of the matchup the attack runs twice
    if (att.type === 'Shell' && (matchupTurn + 1) % PASSIVE.shell.every === 0) {
      atkBonus *= PASSIVE.shell.mult; passive = true;
      events.push({ type: 'passive', cardId: att.id, message: `[Shell] ${att.name}'s cron job fired — the attack runs twice!` });
    }

    // C# Critical Hit
    if (att.type === 'C#' && rng() < PASSIVE.csharp.chance * rarityMult) {
      atkBonus *= PASSIVE.csharp.critMult; crit = true;
    }

    // C/C++ Raw Power (ignores part of the DEF)
    const rawPower = att.type === 'C' || att.type === 'C++';
    const defEffective = def.def * (rawPower ? 1 - PASSIVE.rawPower.defIgnored : 1) * momentum(def);
    const atkEffective = att.atk * atkBonus * typeMult * momentum(att);

    let dmg = zeroDmg ? 0 : mitigatedDamage(atkEffective, defEffective);

    // JS double callback
    if (!zeroDmg && (att.type === 'JavaScript' || st(att).jsSynergy)) {
      const chance = att.type === 'JavaScript' ? PASSIVE.javascript.chance * rarityMult : st(att).jsSynergy;
      if (rng() < chance) {
        passive = true;
        events.push({ type: 'passive', cardId: att.id, message: `[JS] Double Callback!` });
        dmg += Math.floor(dmg * PASSIVE.javascript.bonus);
      }
    }

    if (passive) att.statsPassivesTriggered = (att.statsPassivesTriggered || 0) + 1;
    return { dmg, crit };
  };

  /** Defender-side reductions, shields and caps on an incoming hit. */
  const receive = (def: BattleCard, att: BattleCard, rawDmg: number, events: BattleLogEvent[]) => {
    let mult = 1;
    // TypeScript Type Safety
    if (def.type === 'TypeScript') mult *= PASSIVE.typescript.damageTaken;
    // HTML Graceful Degradation
    if (def.type === 'HTML' && def.hp < def.maxHp * PASSIVE.html.hpThreshold) mult *= PASSIVE.html.damageTaken;
    // Rust Synergy
    mult -= st(def).rustSynergy;
    let dmg = Math.floor(rawDmg * Math.max(0, mult));

    // Swift Dodge
    if (dmg > 0 && def.type === 'Swift' && rng() < PASSIVE.swift.dodgeChance * getRarityMultiplier(def.rarity)) {
      def.statsPassivesTriggered = (def.statsPassivesTriggered || 0) + 1;
      events.push({ type: 'passive', cardId: def.id, message: `[Swift] ${def.name} dodged ${att.name}'s attack!` });
      return 0;
    }

    // Rust Iron Shield: nothing gets through on its first turn (a 0-damage hit doesn't touch it)
    if (st(def).ironShield) {
      if (dmg > 0) events.push({ type: 'passive', cardId: def.id, message: `Iron Shield blocked all damage!` });
      return 0;
    }

    // Kotlin Null Safety: no single turn takes more than X% of max HP
    const cap = Math.max(1, Math.floor(def.maxHp * PASSIVE.kotlin.maxHpPctPerTurn));
    if (def.type === 'Kotlin' && dmg > cap) {
      def.statsPassivesTriggered = (def.statsPassivesTriggered || 0) + 1;
      events.push({ type: 'passive', cardId: def.id, message: `[Kotlin] Null Safety! ${def.name} only takes ${cap} damage.` });
      dmg = cap;
    }
    return dmg;
  };

  /** Healing at the end of a turn the card survived. */
  const endOfTurn = (card: BattleCard, events: BattleLogEvent[]) => {
    if (card.hp <= 0) return;

    // Dart Hot Reload (once per battle)
    if (card.type === 'Dart' && !st(card).dartReloadUsed && card.hp < card.maxHp * PASSIVE.dart.hpThreshold) {
      st(card).dartReloadUsed = true;
      const heal = Math.floor(card.maxHp * PASSIVE.dart.healMaxHpPct);
      card.hp = Math.min(card.maxHp, card.hp + heal);
      card.statsPassivesTriggered = (card.statsPassivesTriggered || 0) + 1;
      events.push({ type: 'passive', cardId: card.id, message: `[Dart] Hot Reload! ${card.name} restored ${heal} HP.` });
    }

    // Regen: Python, Jupyter Notebook, Python Synergy
    // (every card heals at the higher of its own rate and the synergy rate)
    const ownRegen = card.type === 'Python' ? PASSIVE.python.regenAtkPct
      : card.type === 'Jupyter Notebook' ? PASSIVE.jupyter.regenAtkPct : 0;
    const healPct = Math.max(ownRegen, st(card).pySynergy);
    if (healPct > 0) {
      const heal = Math.floor(card.atk * healPct);
      card.hp = Math.min(card.maxHp, card.hp + heal);
      const tag = card.type === 'Jupyter Notebook' ? 'Jupyter' : 'Python';
      events.push({ type: 'passive', cardId: card.id, message: `[${tag}] Regenerated ${heal} HP.` });
    }
  };

  /** The card that stays on the field after a knockout builds Momentum. */
  const recordKnockout = (winner: BattleCard, events: BattleLogEvent[]) => {
    winner.consecutiveWins = (winner.consecutiveWins || 0) + 1;
    if (winner.consecutiveWins >= 2) {
      const newStacks = Math.min(3, winner.consecutiveWins - 1);
      if ((winner.momentumStacks || 0) < newStacks) {
        winner.momentumStacks = newStacks;
        winner.statsMomentumAchieved = true;
        events.push({ type: 'passive', cardId: winner.id, message: `${winner.name} is On Fire! (+${Math.round(newStacks * MOMENTUM_BONUS_PER_STACK * 100)}% Stats)` });
      }
    }
  };

  let cJustEntered = true;
  let dJustEntered = true;
  let turnsInMatchup = 0;

  while (cIdx < cTeam.length && dIdx < dTeam.length) {
    const cCard = cTeam[cIdx];
    const dCard = dTeam[dIdx];

    const turnEvents: BattleLogEvent[] = [];
    const cHpStart = cCard.hp;
    const dHpStart = dCard.hp;

    const entering: [BattleCard, BattleCard][] = [];
    if (cJustEntered) entering.push([cCard, dCard]);
    if (dJustEntered) entering.push([dCard, cCard]);
    for (const [card] of entering) enterField(card, turnEvents);
    resolveFirstStrikes(entering, turnEvents);

    cJustEntered = false;
    dJustEntered = false;

    if (cCard.hp <= 0 || dCard.hp <= 0) {
        // Someone died from first strike
        if (cCard.hp <= 0) {
            turnEvents.push({ type: 'defeat', cardId: cCard.id, message: `${cCard.name} was defeated!` });
            cIdx++; cJustEntered = true; turnsInMatchup = 0;
            recordKnockout(dCard, turnEvents);
        }
        if (dCard.hp <= 0) {
            turnEvents.push({ type: 'defeat', cardId: dCard.id, message: `${dCard.name} was defeated!` });
            dIdx++; dJustEntered = true; turnsInMatchup = 0;
            if (cCard.hp > 0) recordKnockout(cCard, turnEvents);
        }
        endShields(cCard, dCard);
        log.push({
            turnNumber, cCardId: cCard.id, dCardId: dCard.id,
            cHpStart, dHpStart, cHpEnd: Math.max(0, cCard.hp), dHpEnd: Math.max(0, dCard.hp),
            events: turnEvents
        });
        turnNumber++;
        continue;
    }

    // --- Damage Calculation (both cards attack at the same time) ---
    const cHit = attack(cCard, dCard, turnsInMatchup, turnEvents);
    const dHit = attack(dCard, cCard, turnsInMatchup, turnEvents);

    const cDmgToD = receive(dCard, cCard, cHit.dmg, turnEvents);
    const dDmgToC = receive(cCard, dCard, dHit.dmg, turnEvents);
    endShields(cCard, dCard);

    cCard.hp -= dDmgToC;
    dCard.hp -= cDmgToD;

    // Track stats
    cCard.statsTakenDamage = (cCard.statsTakenDamage || 0) + dDmgToC;
    dCard.statsTakenDamage = (dCard.statsTakenDamage || 0) + cDmgToD;
    cCard.statsDealtDamage = (cCard.statsDealtDamage || 0) + cDmgToD;
    dCard.statsDealtDamage = (dCard.statsDealtDamage || 0) + dDmgToC;

    const damageEvent = (att: BattleCard, target: BattleCard, dmg: number, crit: boolean) => {
      if (dmg <= 0) return;
      if (crit) att.statsCritsLanded = (att.statsCritsLanded || 0) + 1;
      turnEvents.push({
        type: 'damage', cardId: att.id, targetId: target.id, value: dmg,
        message: crit ? `[C#] ${att.name} landed a Critical Hit for ${dmg} damage!` : `${att.name} dealt ${dmg} damage.`,
      });
    };
    damageEvent(cCard, dCard, cDmgToD, cHit.crit);
    damageEvent(dCard, cCard, dDmgToC, dHit.crit);

    trySuppress(cCard, turnEvents);
    trySuppress(dCard, turnEvents);

    // End of Turn Effects (Hot Reload, Regen)
    endOfTurn(cCard, turnEvents);
    endOfTurn(dCard, turnEvents);

    // Defeats
    if (cCard.hp <= 0 && dCard.hp <= 0) {
        turnEvents.push({ type: 'draw', message: `Both ${cCard.name} and ${dCard.name} go down!` });
        cIdx++; cJustEntered = true;
        dIdx++; dJustEntered = true;
        turnsInMatchup = 0;
    } else if (cCard.hp <= 0) {
        turnEvents.push({ type: 'defeat', cardId: cCard.id, message: `${cCard.name} was defeated!` });
        cIdx++; cJustEntered = true; turnsInMatchup = 0;
        recordKnockout(dCard, turnEvents);
    } else if (dCard.hp <= 0) {
        turnEvents.push({ type: 'defeat', cardId: dCard.id, message: `${dCard.name} was defeated!` });
        dIdx++; dJustEntered = true; turnsInMatchup = 0;
        recordKnockout(cCard, turnEvents);
    } else {
        turnsInMatchup++;
    }

    log.push({
      turnNumber,
      cCardId: cCard.id,
      dCardId: dCard.id,
      cHpStart,
      dHpStart,
      cHpEnd: Math.max(0, cCard.hp),
      dHpEnd: Math.max(0, dCard.hp),
      events: turnEvents
    });

    turnNumber++;

    // Per-matchup turn cap: resolved by remaining HP %
    if (turnsInMatchup >= MATCHUP_TURN_CAP) {
        const cPct = cCard.hp / cCard.maxHp;
        const dPct = dCard.hp / dCard.maxHp;

        const tiebreakerEvents: BattleLogEvent[] = [
            { type: 'passive', message: `Turn cap reached! Resolving matchup by HP%...` }
        ];

        if (cPct > dPct) {
            dCard.hp = 0;
            tiebreakerEvents.push({ type: 'defeat', cardId: dCard.id, message: `${cCard.name} wins by HP advantage (${Math.floor(cPct*100)}% to ${Math.floor(dPct*100)}%)!` });
            dIdx++; dJustEntered = true; turnsInMatchup = 0;
        } else if (dPct > cPct) {
            cCard.hp = 0;
            tiebreakerEvents.push({ type: 'defeat', cardId: cCard.id, message: `${dCard.name} wins by HP advantage (${Math.floor(dPct*100)}% to ${Math.floor(cPct*100)}%)!` });
            cIdx++; cJustEntered = true; turnsInMatchup = 0;
        } else {
            // true tie
            cCard.hp = 0;
            dCard.hp = 0;
            tiebreakerEvents.push({ type: 'draw', message: `Exact HP% draw! Both go down!` });
            cIdx++; cJustEntered = true;
            dIdx++; dJustEntered = true;
            turnsInMatchup = 0;
        }

        log.push({
            turnNumber,
            cCardId: cCard.id,
            dCardId: dCard.id,
            cHpStart: cCard.hp,
            dHpStart: dCard.hp,
            cHpEnd: Math.max(0, cCard.hp),
            dHpEnd: Math.max(0, dCard.hp),
            events: tiebreakerEvents
        });
        turnNumber++;
    }

    // Failsafe wrapper to prevent infinite loops from 1 DMG minimums if HP gets incredibly high somehow (shouldn't realistically happen)
    if (turnNumber > 200) {
        log.push({ turnNumber, cCardId: cCard.id, dCardId: dCard.id, cHpStart: cCard.hp, dHpStart: dCard.hp, cHpEnd: Math.max(0, cCard.hp), dHpEnd: Math.max(0, dCard.hp), events: [{type: 'battle_end', message:'Turn Limit Reached!'}] });
        turnNumber++;
        break;
    }
  }

  const winner = decideBattleWinner(cTeam, dTeam, cIdx, dIdx);
  const bothOut = cIdx >= cTeam.length && dIdx >= dTeam.length;
  const bothStanding = cIdx < cTeam.length && dIdx < dTeam.length;
  if (bothOut || bothStanding) {
    const cPct = Math.floor(remainingHpFraction(cTeam) * 100);
    const dPct = Math.floor(remainingHpFraction(dTeam) * 100);
    log.push({
      turnNumber,
      cCardId: '', dCardId: '', cHpStart: 0, dHpStart: 0, cHpEnd: 0, dHpEnd: 0,
      events: [{
        type: 'draw',
        message: bothOut
          ? 'Double KO! Exact tie goes to the defender.'
          : `Turn limit reached! Decided by remaining team HP (${cPct}% vs ${dPct}%, exact tie goes to the defender).`,
      }],
    });
    turnNumber++;
  }

  log.push({
      turnNumber: turnNumber,
      cCardId: '', dCardId: '', cHpStart: 0, dHpStart: 0, cHpEnd: 0, dHpEnd: 0,
      events: [{ type: 'battle_end', message: `${winner} WINS THE BATTLE!`}]
  });

  return {
    winner,
    log,
    challengerTeamState: cTeam,
    defenderTeamState: dTeam,
  };
}
