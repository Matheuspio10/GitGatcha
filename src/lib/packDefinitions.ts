export interface PackVisualTheme {
  gradient: string;       // CSS gradient for the pack card
  border: string;         // CSS border color
  textColor: string;      // CSS text color
  accentColor: string;    // CSS accent for badges
  animated?: boolean;     // Animated border for premium packs
}

export interface PackDefinition {
  id: string;
  name: string;
  description: string;
  category: 'language' | 'contributor' | 'era' | 'company' | 'rarity' | 'regional';
  cardCount: number;
  cost: number;
  visualTheme: PackVisualTheme;
  guaranteedMinRarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | null;
  allCommon?: boolean;       // Junk Drawer
  noPreview?: boolean;       // Mystery Box
  buildQuery: () => string;  // Returns GitHub Search API query string
}

// ─── LANGUAGE & STACK PACKS ──────────────────────────────────────────────

const theJavaScriptCoven: PackDefinition = {
  id: 'javascript-coven',
  name: 'The JavaScript Coven',
  description: 'Dark rituals written in async/await. Enter if you dare.',
  category: 'language',
  cardCount: 5,
  cost: 300,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #f7df1e 0%, #1a1a1a 100%)',
    border: '#f7df1e',
    textColor: '#f7df1e',
    accentColor: '#1a1a1a',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user language:JavaScript language:TypeScript followers:>5',
};

const pythonistas: PackDefinition = {
  id: 'pythonistas',
  name: 'Pythonistas',
  description: 'Zen masters of readable code and data sorcery.',
  category: 'language',
  cardCount: 5,
  cost: 300,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #306998 0%, #FFD43B 100%)',
    border: '#FFD43B',
    textColor: '#FFD43B',
    accentColor: '#306998',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user language:Python followers:>5',
};

const rustOrBust: PackDefinition = {
  id: 'rust-or-bust',
  name: 'Rust or Bust',
  description: 'They chose the hard path. Their code never crashes.',
  category: 'language',
  cardCount: 5,
  cost: 350,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #CE422B 0%, #2a2a2a 100%)',
    border: '#CE422B',
    textColor: '#CE422B',
    accentColor: '#3a3a3a',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user language:Rust followers:>5',
};

const cssWizards: PackDefinition = {
  id: 'css-wizards',
  name: 'CSS Wizards',
  description: "Nobody understands how they do it. Neither do they.",
  category: 'language',
  cardCount: 5,
  cost: 250,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #ff6ec7 0%, #7b2ff7 100%)',
    border: '#ff6ec7',
    textColor: '#ff6ec7',
    accentColor: '#7b2ff7',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user language:CSS followers:>2',
};

const goGophers: PackDefinition = {
  id: 'go-gophers',
  name: 'The Go Gophers',
  description: 'Fast, simple, concurrent. Just like them.',
  category: 'language',
  cardCount: 5,
  cost: 300,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #00ADD8 0%, #ffffff 100%)',
    border: '#00ADD8',
    textColor: '#00ADD8',
    accentColor: '#ffffff',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user language:Go followers:>5',
};

const rubyRelics: PackDefinition = {
  id: 'ruby-relics',
  name: 'Ruby Relics',
  description: 'From the golden age of Rails. Still shipping.',
  category: 'language',
  cardCount: 5,
  cost: 280,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #CC342D 0%, #4a0e0b 100%)',
    border: '#CC342D',
    textColor: '#CC342D',
    accentColor: '#4a0e0b',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user language:Ruby followers:>5',
};

const cppAncients: PackDefinition = {
  id: 'cpp-ancients',
  name: 'C++ Ancients',
  description: 'They were writing memory management before you were born.',
  category: 'language',
  cardCount: 5,
  cost: 320,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #8a8a8a 0%, #00427e 100%)',
    border: '#8a8a8a',
    textColor: '#c0c0c0',
    accentColor: '#00427e',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user language:C language:C++ followers:>5',
};

// ─── CONTRIBUTOR TYPE PACKS ──────────────────────────────────────────────

const openSourceHeroes: PackDefinition = {
  id: 'open-source-heroes',
  name: 'The Open Source Heroes',
  description: 'They build for everyone. Legends of the commons.',
  category: 'contributor',
  cardCount: 5,
  cost: 400,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #28a745 0%, #155724 100%)',
    border: '#28a745',
    textColor: '#28a745',
    accentColor: '#155724',
  },
  guaranteedMinRarity: 'Rare',
  buildQuery: () => 'type:user repos:>50 followers:>100',
};

const soloArchitects: PackDefinition = {
  id: 'solo-architects',
  name: 'The Solo Architects',
  description: 'They ship alone. Entire ecosystems built by one person.',
  category: 'contributor',
  cardCount: 5,
  cost: 380,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #6f42c1 0%, #2d1b69 100%)',
    border: '#6f42c1',
    textColor: '#b794f6',
    accentColor: '#2d1b69',
  },
  guaranteedMinRarity: 'Rare',
  buildQuery: () => 'type:user repos:>30 followers:>50',
};

const silentGiants: PackDefinition = {
  id: 'silent-giants',
  name: 'The Silent Giants',
  description: 'Underrated. Underknown. Unstoppable.',
  category: 'contributor',
  cardCount: 5,
  cost: 450,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #4a5568 0%, #1a202c 100%)',
    border: '#718096',
    textColor: '#a0aec0',
    accentColor: '#1a202c',
  },
  guaranteedMinRarity: 'Epic',
  buildQuery: () => 'type:user followers:100..500 repos:>20',
};

const maintainers: PackDefinition = {
  id: 'maintainers',
  name: 'The Maintainers',
  description: 'The ones keeping the open source world from falling apart.',
  category: 'contributor',
  cardCount: 5,
  cost: 400,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #e67e22 0%, #7f4413 100%)',
    border: '#e67e22',
    textColor: '#f0c27f',
    accentColor: '#7f4413',
  },
  guaranteedMinRarity: 'Rare',
  buildQuery: () => 'type:user repos:>50 followers:>200',
};

// ─── ERA PACKS ───────────────────────────────────────────────────────────

const githubOGs: PackDefinition = {
  id: 'github-ogs',
  name: 'GitHub OGs',
  description: 'They were here before the hype. Before the green squares. Before everything.',
  category: 'era',
  cardCount: 5,
  cost: 500,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #d4a574 0%, #8b6914 100%)',
    border: '#d4a574',
    textColor: '#f5deb3',
    accentColor: '#8b6914',
  },
  guaranteedMinRarity: 'Epic',
  buildQuery: () => 'type:user created:<2010-01-01 followers:>10',
};

const newBlood: PackDefinition = {
  id: 'new-blood',
  name: 'New Blood',
  description: 'Fresh accounts. Explosive trajectories. Watch them rise.',
  category: 'era',
  cardCount: 5,
  cost: 280,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #39ff14 0%, #0a0a0a 100%)',
    border: '#39ff14',
    textColor: '#39ff14',
    accentColor: '#0a0a0a',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user created:>2022-01-01 followers:>50',
};

const fossils: PackDefinition = {
  id: 'the-fossils',
  name: 'The Fossils',
  description: 'Abandoned but not forgotten. Their legacy lives on in your node_modules.',
  category: 'era',
  cardCount: 5,
  cost: 350,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #2d5016 0%, #6b7c5e 100%)',
    border: '#6b7c5e',
    textColor: '#a8b89c',
    accentColor: '#2d5016',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user created:<2015-01-01 repos:>10 followers:>20',
};

// ─── COMPANY & ORIGIN PACKS ─────────────────────────────────────────────

const bigTechPack: PackDefinition = {
  id: 'big-tech',
  name: 'Big Tech Pack',
  description: 'The ones with the badges and the free lunches.',
  category: 'company',
  cardCount: 5,
  cost: 600,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #1a73e8 0%, #ffffff 100%)',
    border: '#1a73e8',
    textColor: '#1a73e8',
    accentColor: '#ffffff',
  },
  guaranteedMinRarity: 'Epic',
  buildQuery: () => 'type:user followers:>100',
};

const indieHackers: PackDefinition = {
  id: 'indie-hackers',
  name: 'Indie Hackers',
  description: 'No office. No boss. Just shipping.',
  category: 'company',
  cardCount: 5,
  cost: 380,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #d4a053 0%, #fdf6e3 100%)',
    border: '#d4a053',
    textColor: '#d4a053',
    accentColor: '#fdf6e3',
  },
  guaranteedMinRarity: null,
  buildQuery: () => 'type:user repos:>20 followers:>50',
};

// ─── REGIONAL PACKS ─────────────────────────────────────────────────────

function buildRegionalPack(
  id: string,
  name: string,
  description: string,
  locations: string[],
  gradient: string,
  border: string,
  textColor: string,
  accentColor: string,
): PackDefinition {
  return {
    id,
    name,
    description,
    category: 'regional',
    cardCount: 5,
    cost: 300,
    visualTheme: { gradient, border, textColor, accentColor },
    guaranteedMinRarity: null,
    buildQuery: () => {
      const locationQuery = locations.map(l => `location:${l}`).join(' ');
      return `type:user ${locationQuery} followers:>5`;
    },
  };
}

const brazilianDevs = buildRegionalPack(
  'brazilian-devs',
  'Brazilian Devs',
  'Caffeine-powered. Ship at 2am. Born for the grind.',
  ['Brazil', 'Brasil', 'BR', 'São+Paulo', 'Rio+de+Janeiro', 'Belo+Horizonte', 'Curitiba', 'Porto+Alegre'],
  'linear-gradient(135deg, #009c3b 0%, #ffdf00 100%)',
  '#009c3b', '#ffdf00', '#009c3b',
);

const americanDevs = buildRegionalPack(
  'american-devs',
  'American Devs',
  'From Silicon Valley to everywhere. Building the future at scale.',
  ['USA', 'United+States', 'US', 'San+Francisco', 'New+York', 'Seattle', 'Austin', 'Los+Angeles'],
  'linear-gradient(135deg, #3c3b6e 0%, #b22234 100%)',
  '#3c3b6e', '#ffffff', '#b22234',
);

const indianDevs = buildRegionalPack(
  'indian-devs',
  'Indian Devs',
  'A billion minds. Infinite possibilities. Jugaad kings.',
  ['India', 'IN', 'Bangalore', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Delhi', 'Pune', 'Chennai'],
  'linear-gradient(135deg, #ff9933 0%, #138808 100%)',
  '#ff9933', '#ffffff', '#138808',
);

const germanDevs = buildRegionalPack(
  'german-devs',
  'German Devs',
  'Engineered to perfection. Zero exceptions.',
  ['Germany', 'Deutschland', 'DE', 'Berlin', 'Munich', 'München', 'Hamburg', 'Frankfurt'],
  'linear-gradient(135deg, #000000 0%, #dd0000 50%, #ffcc00 100%)',
  '#dd0000', '#ffcc00', '#000000',
);

const japaneseDevs = buildRegionalPack(
  'japanese-devs',
  'Japanese Devs',
  'Precision in every commit. Code as art form.',
  ['Japan', 'JP', 'Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Fukuoka'],
  'linear-gradient(135deg, #ffffff 0%, #bc002d 100%)',
  '#bc002d', '#bc002d', '#ffffff',
);

const britishDevs = buildRegionalPack(
  'british-devs',
  'British Devs',
  'Keep calm and push to main. Tea-driven development.',
  ['UK', 'United+Kingdom', 'England', 'London', 'Manchester', 'Edinburgh', 'Bristol', 'Cambridge'],
  'linear-gradient(135deg, #00247d 0%, #cf142b 100%)',
  '#00247d', '#ffffff', '#cf142b',
);

const canadianDevs = buildRegionalPack(
  'canadian-devs',
  'Canadian Devs',
  "Sorry for being so good. They're unfairly polite AND talented.",
  ['Canada', 'CA', 'Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary'],
  'linear-gradient(135deg, #ff0000 0%, #ffffff 100%)',
  '#ff0000', '#ffffff', '#ff0000',
);

const frenchDevs = buildRegionalPack(
  'french-devs',
  'French Devs',
  'Elegance in every algorithm. Code with an accent.',
  ['France', 'FR', 'Paris', 'Lyon', 'Marseille', 'Toulouse', 'Bordeaux'],
  'linear-gradient(135deg, #002395 0%, #ffffff 50%, #ed2939 100%)',
  '#002395', '#ffffff', '#ed2939',
);

const chineseDevs = buildRegionalPack(
  'chinese-devs',
  'Chinese Devs',
  'Scaling to billions. Everything is a distributed system.',
  ['China', 'CN', 'Beijing', 'Shanghai', 'Shenzhen', 'Hangzhou', 'Guangzhou', 'Chengdu'],
  'linear-gradient(135deg, #de2910 0%, #ffde00 100%)',
  '#de2910', '#ffde00', '#de2910',
);

const koreanDevs = buildRegionalPack(
  'korean-devs',
  'Korean Devs',
  'K-code wave. Esports reflexes applied to debugging.',
  ['Korea', 'South+Korea', 'KR', 'Seoul', 'Busan', 'Incheon', 'Daegu'],
  'linear-gradient(135deg, #003478 0%, #ffffff 50%, #c60c30 100%)',
  '#003478', '#ffffff', '#c60c30',
);

const australianDevs = buildRegionalPack(
  'australian-devs',
  'Australian Devs',
  "Coding upside down. Everything's trying to kill their uptime.",
  ['Australia', 'AU', 'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
  'linear-gradient(135deg, #00008b 0%, #ffcc00 100%)',
  '#00008b', '#ffcc00', '#00008b',
);

// ─── RARITY-FOCUSED PACKS ───────────────────────────────────────────────

const legendaryDrop: PackDefinition = {
  id: 'legendary-drop',
  name: 'The Legendary Drop',
  description: 'Absurdly expensive. Absurdly worth it.',
  category: 'rarity',
  cardCount: 3,
  cost: 1200,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #ffd700 0%, #b8860b 30%, #ffd700 60%, #b8860b 100%)',
    border: '#ffd700',
    textColor: '#ffd700',
    accentColor: '#b8860b',
    animated: true,
  },
  guaranteedMinRarity: 'Legendary',
  buildQuery: () => 'type:user followers:>10000',
};

const junkDrawer: PackDefinition = {
  id: 'junk-drawer',
  name: 'The Junk Drawer',
  description: "You'll get a lot of cards. You won't know any of them. That's the point.",
  category: 'rarity',
  cardCount: 10,
  cost: 150,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #666666 0%, #999999 30%, #777777 60%, #888888 100%)',
    border: '#888888',
    textColor: '#aaaaaa',
    accentColor: '#666666',
  },
  guaranteedMinRarity: null,
  allCommon: true,
  buildQuery: () => 'type:user followers:<50 repos:>0',
};

const mysteryBox: PackDefinition = {
  id: 'mystery-box',
  name: 'The Mystery Box',
  description: "Could be anything. Could be a Legendary. Could be five Commons. Good luck.",
  category: 'rarity',
  cardCount: 5,
  cost: 500,
  visualTheme: {
    gradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
    border: '#6c63ff',
    textColor: '#ffffff',
    accentColor: '#6c63ff',
    animated: true,
  },
  guaranteedMinRarity: null,
  noPreview: true,
  buildQuery: () => 'type:user followers:>0',
};

// ─── ALL PACKS REGISTRY ─────────────────────────────────────────────────

export const ALL_PACKS: PackDefinition[] = [
  // Language & Stack
  theJavaScriptCoven,
  pythonistas,
  rustOrBust,
  cssWizards,
  goGophers,
  rubyRelics,
  cppAncients,
  // Contributor Type
  openSourceHeroes,
  soloArchitects,
  silentGiants,
  maintainers,
  // Era
  githubOGs,
  newBlood,
  fossils,
  // Company & Origin
  bigTechPack,
  indieHackers,
  // Regional
  brazilianDevs,
  americanDevs,
  indianDevs,
  germanDevs,
  japaneseDevs,
  britishDevs,
  canadianDevs,
  frenchDevs,
  chineseDevs,
  koreanDevs,
  australianDevs,
  // Rarity-Focused
  legendaryDrop,
  junkDrawer,
  mysteryBox,
];

export function getPackById(id: string): PackDefinition | undefined {
  return ALL_PACKS.find(p => p.id === id);
}

export type PackCategory = PackDefinition['category'];

export const PACK_CATEGORIES: { key: PackCategory; label: string }[] = [
  { key: 'language', label: 'Language & Stack' },
  { key: 'contributor', label: 'Contributor Type' },
  { key: 'era', label: 'Era' },
  { key: 'company', label: 'Company & Origin' },
  { key: 'regional', label: 'Regional' },
  { key: 'rarity', label: 'Rarity-Focused' },
];

/** Serializable pack info for the frontend (strips buildQuery function) */
export function getSerializablePacks() {
  return ALL_PACKS.map(({ buildQuery, ...rest }) => rest);
}
