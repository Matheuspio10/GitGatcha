export type CardType = 'Python' | 'JavaScript' | 'Ruby' | 'PHP' | 'Rust' | 'C' | 'C++' | 'Go' | 'TypeScript' | 'CSS' | 'Neutral' | 'Legendary';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface BattleCard {
  id: string;
  name: string;
  atk: number;
  def: number;
  hp: number;
  maxHp: number;
  rarity: Rarity;
  primaryLanguage: string | null;
  type: CardType;
  avatarUrl?: string | null;
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

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

export function getCardType(card: any): CardType {
  if (card.rarity === 'Legendary' && card.pack === 'GitHub OGs') {
    return 'Legendary';
  }
  const lang = card.primaryLanguage;
  if (!lang) return 'Neutral';
  
  if (lang === 'Python' || lang === 'JavaScript' || lang === 'Ruby' || lang === 'PHP' || lang === 'Rust' || lang === 'C' || lang === 'C++' || lang === 'Go' || lang === 'TypeScript' || lang === 'CSS') {
    return lang as CardType;
  }
  return 'Neutral';
}

function getRarityMultiplier(rarity: string): number {
  switch (rarity) {
    case 'Common': return 0.6;   // -40%
    case 'Uncommon': return 0.8; // -20%
    case 'Rare': return 1.0;     // Base
    case 'Epic': return 1.2;     // +20%
    case 'Legendary': return 1.4;// +40%
    default: return 1.0;
  }
}

// ---------------------------------------------------------
// Type Matchups (1.5x / 0.75x)
// ---------------------------------------------------------
function getTypeMultiplier(attackerType: CardType, defenderType: CardType): number {
  const advantages: Record<string, string[]> = {
    'Python': ['JavaScript'],
    'JavaScript': ['Ruby'],
    'Ruby': ['PHP'],
    'PHP': ['Python'],
    'Rust': ['C', 'C++'],
    'C': ['Go'],
    'C++': ['Go'],
    'Go': ['Rust'],
    'TypeScript': ['JavaScript']
  };

  // CSS loses to every type (deals 0.75x except vs CSS/Legendary/Neutral)
  if (attackerType === 'CSS') {
    if (defenderType !== 'CSS' && defenderType !== 'Legendary' && defenderType !== 'Neutral') {
      return 0.75;
    }
    return 1.0;
  }

  if (advantages[attackerType] && advantages[attackerType].includes(defenderType)) {
    return 1.5;
  }

  // Reverse: check if attacker is at a type disadvantage
  let isDisadvantage = false;
  Object.keys(advantages).forEach(t => {
    if (advantages[t].includes(attackerType as string) && t === (defenderType as string)) {
      isDisadvantage = true;
    }
  });

  if (isDisadvantage) return 0.75;

  return 1.0;
}

// ---------------------------------------------------------
// Core Resolver Function
// ---------------------------------------------------------
export function resolve3v3Battle(cTeamInitial: BattleCard[], dTeamInitial: BattleCard[]): BattleResult {
  // Deep copy teams
  const cTeam = JSON.parse(JSON.stringify(cTeamInitial)) as BattleCard[];
  const dTeam = JSON.parse(JSON.stringify(dTeamInitial)) as BattleCard[];

  const log: TurnLog[] = [];
  let turnNumber = 1;

  let cIdx = 0;
  let dIdx = 0;

  // Synergies initialization
  const applySynergies = (team: BattleCard[], isChallenger: boolean) => {
    const events: BattleLogEvent[] = [];
    const typeCounts: Record<string, number> = {};
    team.forEach(c => {
      typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
    });

    // Check mixed team (all 3 unique)
    if (Object.keys(typeCounts).length === 3) {
      team.forEach(c => c.atk = Math.floor(c.atk * 1.08));
      events.push({ type: 'synergy', message: `${isChallenger ? 'Challenger' : 'Defender'} Mixed Team synergy! +8% ATK to all.` });
    }

    // Check pairs/triples
    Object.keys(typeCounts).forEach(type => {
      if (typeCounts[type] >= 2) {
        const mult = typeCounts[type] === 3 ? 2 : 1;
        events.push({ type: 'synergy', message: `${isChallenger ? 'Challenger' : 'Defender'} ${type} Synergy (x${typeCounts[type]}) activated!` });
        // Specific synergy effects will be handled during turns, but we can store markers on the cards
        if (type === 'Python') {
            team.forEach(c => (c as any).pySynergy = 0.03 * mult);
        }
        if (type === 'Rust') {
            team.forEach(c => (c as any).rustSynergy = 0.10 * mult);
        }
        if (type === 'JavaScript') {
            team.forEach(c => (c as any).jsSynergy = 0.10 * mult);
        }
        if (type === 'Go') {
            team.forEach(c => (c as any).goSynergy = true); // Handled on Enter
        }
      }
    });

    // Big Tech + Indie Hacker synergy - skip for now or implement if you add "pack" to card model.

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

  const enterField = (card: BattleCard, opponent: BattleCard, logEvents: BattleLogEvent[]) => {
      logEvents.push({ type: 'enter_field', cardId: card.id, message: `${card.name} enters the field!` });
      
      // Rust Iron Shield
      if (card.type === 'Rust') {
          (card as any).ironShieldActive = true;
          logEvents.push({ type: 'passive', cardId: card.id, message: `[Rust] ${card.name} gained Iron Shield (blocks first turn damage).` });
      }

      // Go First Strike OR Go Synergy First Strike
      if (card.type === 'Go' || (card as any).goSynergy) {
          logEvents.push({ type: 'passive', cardId: card.id, message: `${card.name} strikes first on entry!` });
          let dmg = Math.floor(Math.max(card.atk * 0.15, card.atk - opponent.def * 0.25));
          if (dmg < 1) dmg = 1;

          if ((opponent as any).ironShieldActive) {
            dmg = 0;
            (opponent as any).ironShieldActive = false; // consume it? Or does it block the whole FIRST TURN? "absorbs the first full turn of damage completely, taking zero damage that turn only." 
            logEvents.push({ type: 'passive', cardId: opponent.id, message: `Iron Shield blocked First Strike!` });
          } else {
             opponent.hp -= dmg;
             logEvents.push({ type: 'damage', cardId: card.id, targetId: opponent.id, value: dmg, message: `${card.name} dealt ${dmg} first strike damage.` })
          }
      }
  };

  let cJustEntered = true;
  let dJustEntered = true;
  let turnsInMatchup = 0;

  while (cIdx < 3 && dIdx < 3) {
    const cCard = cTeam[cIdx];
    const dCard = dTeam[dIdx];

    const turnEvents: BattleLogEvent[] = [];
    
    if (cJustEntered) enterField(cCard, dCard, turnEvents);
    if (dJustEntered && dCard.hp > 0) enterField(dCard, cCard, turnEvents); // Only if dCard didn't die from cCard's first strike

    cJustEntered = false;
    dJustEntered = false;

    if (cCard.hp <= 0 || dCard.hp <= 0) {
        // Someone died from first strike
        if (cCard.hp <= 0) {
            turnEvents.push({ type: 'defeat', cardId: cCard.id, message: `${cCard.name} was defeated!` });
            cIdx++; cJustEntered = true; turnsInMatchup = 0;
        }
        if (dCard.hp <= 0) {
            turnEvents.push({ type: 'defeat', cardId: dCard.id, message: `${dCard.name} was defeated!` });
            dIdx++; dJustEntered = true; turnsInMatchup = 0;
        }
        log.push({
            turnNumber, cCardId: cCard.id, dCardId: dCard.id,
            cHpStart: cCard.hp, dHpStart: dCard.hp, cHpEnd: Math.max(0, cCard.hp), dHpEnd: Math.max(0, dCard.hp),
            events: turnEvents
        });
        turnNumber++;
        continue;
    }

    const cHpStart = cCard.hp;
    const dHpStart = dCard.hp;

    // --- Damage Calculation ---
    // Type Multipliers
    let cTypeMult = getTypeMultiplier(cCard.type, dCard.type);
    let dTypeMult = getTypeMultiplier(dCard.type, cCard.type);

    if (cTypeMult > 1) turnEvents.push({ type: 'type_advantage', cardId: cCard.id, message: `${cCard.name} has Type Advantage!` });
    if (dTypeMult > 1) turnEvents.push({ type: 'type_advantage', cardId: dCard.id, message: `${dCard.name} has Type Advantage!` });

    // CSS Passive (20% Double Damage, or Undefined Behavior)
    const cRarityMult = getRarityMultiplier(cCard.rarity);
    const dRarityMult = getRarityMultiplier(dCard.rarity);

    let cAtkBonus = 1;
    let dAtkBonus = 1;

    let cZeroDmg = false;
    let dZeroDmg = false;

    // CSS Undefined Behavior
    if (cCard.type === 'CSS') {
        if (Math.random() < 0.25 * cRarityMult) {
            cAtkBonus = 2;
            turnEvents.push({ type: 'passive', cardId: cCard.id, message: `[CSS] ${cCard.name} double damage!` });
        } else if (Math.random() < 0.15 * cRarityMult) {
            cZeroDmg = true;
            turnEvents.push({ type: 'passive', cardId: cCard.id, message: `[CSS] ${cCard.name} undefined behavior (0 damage)!` });
        }
    }
    if (dCard.type === 'CSS') {
        if (Math.random() < 0.25 * dRarityMult) {
            dAtkBonus = 2;
            turnEvents.push({ type: 'passive', cardId: dCard.id, message: `[CSS] ${dCard.name} double damage!` });
        } else if (Math.random() < 0.15 * dRarityMult) {
            dZeroDmg = true;
            turnEvents.push({ type: 'passive', cardId: dCard.id, message: `[CSS] ${dCard.name} undefined behavior (0 damage)!` });
        }
    }

    // Ruby Last Stand
    if (cCard.type === 'Ruby' && cCard.hp < cCard.maxHp * 0.3) {
        cAtkBonus *= 1.35;
        turnEvents.push({ type: 'passive', cardId: cCard.id, message: `[Ruby] Last stand active!` });
    }
    if (dCard.type === 'Ruby' && dCard.hp < dCard.maxHp * 0.3) {
        dAtkBonus *= 1.35;
        turnEvents.push({ type: 'passive', cardId: dCard.id, message: `[Ruby] Last stand active!` });
    }

    // C/C++ Raw Power (Ignore 50% DEF)
    let dDefEffective = dCard.def;
    let cDefEffective = cCard.def;

    if (cCard.type === 'C' || cCard.type === 'C++') dDefEffective *= 0.5;
    if (dCard.type === 'C' || dCard.type === 'C++') cDefEffective *= 0.5;

    // TypeScript Type Safety (-15% damage taken)
    let cDmgReceivedMult = cCard.type === 'TypeScript' ? 0.85 : 1;
    let dDmgReceivedMult = dCard.type === 'TypeScript' ? 0.85 : 1;

    // Rust Synergy (-10% damage taken)
    if ((cCard as any).rustSynergy) cDmgReceivedMult -= (cCard as any).rustSynergy;
    if ((dCard as any).rustSynergy) dDmgReceivedMult -= (dCard as any).rustSynergy;

    // Base damage formula
    let cBaseAtk = cCard.atk * cAtkBonus * cTypeMult;
    let dBaseAtk = dCard.atk * dAtkBonus * dTypeMult;
    let cDmgToD = Math.floor(Math.max(cBaseAtk * 0.15, cBaseAtk - (dDefEffective * 0.25)));
    let dDmgToC = Math.floor(Math.max(dBaseAtk * 0.15, dBaseAtk - (cDefEffective * 0.25)));

    if (cDmgToD < 1) cDmgToD = 1;
    if (dDmgToC < 1) dDmgToC = 1;

    if (cZeroDmg) cDmgToD = 0;
    if (dZeroDmg) dDmgToC = 0;

    // JS double callback
    if (cCard.type === 'JavaScript' || (cCard as any).jsSynergy) {
        const chance = cCard.type === 'JavaScript' ? 0.25 * cRarityMult : (cCard as any).jsSynergy;
        if (Math.random() < chance) {
            turnEvents.push({ type: 'passive', cardId: cCard.id, message: `[JS] Double Callback!` });
            cDmgToD += Math.floor(cDmgToD * 0.5);
        }
    }
    if (dCard.type === 'JavaScript' || (dCard as any).jsSynergy) {
        const chance = dCard.type === 'JavaScript' ? 0.25 * dRarityMult : (dCard as any).jsSynergy;
        if (Math.random() < chance) {
            turnEvents.push({ type: 'passive', cardId: dCard.id, message: `[JS] Double Callback!` });
            dDmgToC += Math.floor(dDmgToC * 0.5);
        }
    }

    // Apply Damage reduction multipliers
    cDmgToD = Math.floor(cDmgToD * dDmgReceivedMult);
    dDmgToC = Math.floor(dDmgToC * cDmgReceivedMult);

    // Rust Iron Shield turn 1 block
    if ((cCard as any).ironShieldActive) {
        dDmgToC = 0;
        (cCard as any).ironShieldActive = false; // consumed
        turnEvents.push({ type: 'passive', cardId: cCard.id, message: `Iron Shield blocked all damage!` });
    }
    if ((dCard as any).ironShieldActive) {
        cDmgToD = 0;
        (dCard as any).ironShieldActive = false; // consumed
        turnEvents.push({ type: 'passive', cardId: dCard.id, message: `Iron Shield blocked all damage!` });
    }


    cCard.hp -= dDmgToC;
    dCard.hp -= cDmgToD;

    if (cDmgToD > 0) turnEvents.push({ type: 'damage', cardId: cCard.id, targetId: dCard.id, value: cDmgToD, message: `${cCard.name} dealt ${cDmgToD} damage.` });
    if (dDmgToC > 0) turnEvents.push({ type: 'damage', cardId: dCard.id, targetId: cCard.id, value: dDmgToC, message: `${dCard.name} dealt ${dDmgToC} damage.` });

    // End of Turn Effects (Regen)
    if (cCard.hp > 0 && (cCard.type === 'Python' || (cCard as any).pySynergy)) {
        const healPct = cCard.type === 'Python' ? 0.1 : ((cCard as any).pySynergy * 2);
        const heal = Math.floor(cCard.atk * healPct);
        cCard.hp = Math.min(cCard.maxHp, cCard.hp + heal);
        turnEvents.push({ type: 'passive', cardId: cCard.id, message: `[Python] Regenerated ${heal} HP.` });
    }
    if (dCard.hp > 0 && (dCard.type === 'Python' || (dCard as any).pySynergy)) {
        const healPct = dCard.type === 'Python' ? 0.1 : ((dCard as any).pySynergy * 2);
        const heal = Math.floor(dCard.atk * healPct);
        dCard.hp = Math.min(dCard.maxHp, dCard.hp + heal);
        turnEvents.push({ type: 'passive', cardId: dCard.id, message: `[Python] Regenerated ${heal} HP.` });
    }

    // Defeats
    if (cCard.hp <= 0 && dCard.hp <= 0) {
        turnEvents.push({ type: 'draw', message: `Both ${cCard.name} and ${dCard.name} go down!` });
        cIdx++; cJustEntered = true; turnsInMatchup = 0;
        dIdx++; dJustEntered = true; turnsInMatchup = 0;
    } else if (cCard.hp <= 0) {
        turnEvents.push({ type: 'defeat', cardId: cCard.id, message: `${cCard.name} was defeated!` });
        cIdx++; cJustEntered = true; turnsInMatchup = 0;
    } else if (dCard.hp <= 0) {
        turnEvents.push({ type: 'defeat', cardId: dCard.id, message: `${dCard.name} was defeated!` });
        dIdx++; dJustEntered = true; turnsInMatchup = 0;
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
    turnsInMatchup++;

    // 50-turn cap per matchup ties breaker
    if (turnsInMatchup >= 50) {
        console.warn(`[BattleResolver] 50-turn cap reached between ${cCard.name} and ${dCard.name}!`);
        
        // Resolve by remaining HP percentage
        const cPct = cCard.hp / cCard.maxHp;
        const dPct = dCard.hp / dCard.maxHp;
        
        let tiebreakerEvents: BattleLogEvent[] = [
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
            cIdx++; cJustEntered = true; turnsInMatchup = 0;
            dIdx++; dJustEntered = true; turnsInMatchup = 0;
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
        log.push({ turnNumber, cCardId: cCard.id, dCardId: dCard.id, cHpStart: cCard.hp, dHpStart: dCard.hp, cHpEnd: 0, dHpEnd: 0, events: [{type: 'battle_end', message:'Turn Limit Reached!'}] });
        break;
    }
  }

  const winner = cIdx < 3 ? 'CHALLENGER' : 'DEFENDER';

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
