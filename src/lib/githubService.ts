import axios, { AxiosError } from 'axios';
import NodeCache from 'node-cache';
import { computeRarity } from './rarity';
import { computeCardStats } from './cardStats';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API_BASE = 'https://api.github.com';

/**
 * Every call can run on the server token (default) or on a player's own GitHub
 * OAuth token: each token has its own rate limits, so players who connected
 * GitHub don't compete with everyone else for the server's search quota.
 */
function headersFor(token?: string): Record<string, string> {
  const auth = token ?? GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github.v3+json',
    ...(auth ? { Authorization: `token ${auth}` } : {}),
  };
}

// Check if token is missing in production to prevent silent rate-limit bans
if (!GITHUB_TOKEN && process.env.NODE_ENV === 'production') {
  console.warn("WARNING: GITHUB_TOKEN is not set. API rate limits will be severely restricted.");
}

// Per-instance cache of developer stats (cheap win on warm serverless instances)
export const cache = new NodeCache({ stdTTL: 6 * 3600, useClones: false, maxKeys: 5000 });

/**
 * GitHub logins: 1–39 letters, digits or hyphens, not starting with a hyphen.
 * New accounts can't end with a hyphen or use "--", but older ones do (e.g. "LingDong-"),
 * so those are accepted: rejecting them would make real developers impossible to draw.
 * Still enough to keep usernames from changing the API path (no "/", "." or "?").
 */
const GITHUB_LOGIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

export function isValidGitHubLogin(username: unknown): username is string {
  return typeof username === 'string' && GITHUB_LOGIN_RE.test(username);
}

// ─── Low-level API access ───────────────────────────────────────────────

interface RestUser {
  id: number;
  login: string;
  type: string;
  name: string | null;
  bio: string | null;
  avatar_url: string;
  followers: number;
  public_repos: number;
  public_gists: number;
  created_at: string;
}

interface RestRepo {
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  size: number;
}

export class GitHubUnavailableError extends Error {
  constructor(message: string, public retryAt?: number) {
    super(message);
  }
}

/** A player's token was revoked or expired (401): callers fall back to the server token. */
export class GitHubAuthError extends Error {}

// Search API: 30 requests/min per token and a secondary limit on bursts. Calls are
// spaced out per token and instance, and once GitHub says stop we stop until it resets.
const SEARCH_MIN_INTERVAL_MS = 350;

interface TokenState {
  searchChain: Promise<void>;
  searchBlockedUntil: number;
  coreBlockedUntil: number;
}
const tokenStates = new Map<string, TokenState>();

function stateFor(token?: string): TokenState {
  const key = token ?? '';
  let state = tokenStates.get(key);
  if (!state) {
    if (tokenStates.size > 1000) tokenStates.clear();
    state = { searchChain: Promise.resolve(), searchBlockedUntil: 0, coreBlockedUntil: 0 };
    tokenStates.set(key, state);
  }
  return state;
}

function authFailure(err: unknown, token?: string): boolean {
  return !!token && (err as AxiosError)?.response?.status === 401;
}

function blockedUntilFrom(err: AxiosError): number {
  const h = err.response?.headers ?? {};
  const retryAfter = Number(h['retry-after']);
  if (retryAfter > 0) return Date.now() + retryAfter * 1000;
  const reset = Number(h['x-ratelimit-reset']);
  if (reset > 0 && h['x-ratelimit-remaining'] === '0') return reset * 1000;
  return Date.now() + 60_000;
}

function isRateLimit(err: unknown): err is AxiosError {
  const status = (err as AxiosError)?.response?.status;
  return status === 429 || (status === 403 && /rate limit/i.test(JSON.stringify((err as AxiosError).response?.data ?? '')));
}

async function coreGet<T>(path: string, token?: string): Promise<{ data: T; headers: Record<string, unknown> }> {
  const state = stateFor(token);
  if (Date.now() < state.coreBlockedUntil) throw new GitHubUnavailableError('GitHub core API rate limited', state.coreBlockedUntil);
  try {
    const res = await axios.get<T>(`${API_BASE}${path}`, { headers: headersFor(token), timeout: 10_000 });
    return { data: res.data, headers: res.headers as Record<string, unknown> };
  } catch (err) {
    if (authFailure(err, token)) throw new GitHubAuthError('GitHub token rejected');
    if (isRateLimit(err)) {
      state.coreBlockedUntil = blockedUntilFrom(err);
      throw new GitHubUnavailableError('GitHub core API rate limited', state.coreBlockedUntil);
    }
    throw err;
  }
}

export interface SearchUsersPage {
  totalCount: number;
  logins: string[];
  ids: number[];
}

/** One GitHub user search call (users sorted by join date, so positions are stable). */
export async function searchUsers(query: string, page: number, perPage: number, order: 'asc' | 'desc' = 'asc', token?: string): Promise<SearchUsersPage> {
  const state = stateFor(token);
  const turn = state.searchChain.then(() => new Promise<void>(r => setTimeout(r, SEARCH_MIN_INTERVAL_MS)));
  state.searchChain = turn.catch(() => undefined);
  await turn;

  if (Date.now() < state.searchBlockedUntil) throw new GitHubUnavailableError('GitHub search rate limited', state.searchBlockedUntil);
  try {
    const res = await axios.get(`${API_BASE}/search/users`, {
      headers: headersFor(token),
      timeout: 15_000,
      params: { q: query, page, per_page: perPage, sort: 'joined', order },
    });
    const items: { login: string; id: number }[] = res.data.items ?? [];
    return { totalCount: res.data.total_count ?? 0, logins: items.map(u => u.login), ids: items.map(u => u.id) };
  } catch (err) {
    if (authFailure(err, token)) throw new GitHubAuthError('GitHub token rejected');
    if (isRateLimit(err)) {
      state.searchBlockedUntil = blockedUntilFrom(err);
      throw new GitHubUnavailableError('GitHub search rate limited', state.searchBlockedUntil);
    }
    throw err;
  }
}

export interface GitHubAccount {
  id: number;
  login: string;
  type: string;
  followers: number;
  publicRepos: number;
  createdAt: string;
}

/** Account by numeric id (`null` when it doesn't exist / was deleted). */
export async function getAccountById(id: number, token?: string): Promise<GitHubAccount | null> {
  try {
    const { data } = await coreGet<RestUser>(`/user/${id}`, token);
    return { id: data.id, login: data.login, type: data.type, followers: data.followers, publicRepos: data.public_repos, createdAt: data.created_at };
  } catch (err) {
    if ((err as AxiosError)?.response?.status === 404) return null;
    throw err;
  }
}

/**
 * First account (user or org) whose id is greater than `sinceId`.
 * Caveat: GitHub answers `[]` when a long run of ids after `sinceId` was deleted,
 * so `null` does NOT mean there are no newer accounts.
 */
export async function getFirstAccountAfter(sinceId: number, token?: string): Promise<{ id: number; login: string } | null> {
  const { data } = await coreGet<{ id: number; login: string }[]>(`/users?since=${sinceId}&per_page=1`, token);
  return data.length > 0 ? { id: data[0].id, login: data[0].login } : null;
}

export async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await axios.post(`${API_BASE}/graphql`, { query, variables }, {
    headers: { Authorization: `bearer ${GITHUB_TOKEN}` },
    timeout: 15_000,
  });
  if (res.data.errors?.length) throw new Error(`GitHub GraphQL: ${res.data.errors[0].message}`);
  return res.data.data as T;
}

// ─── Developer stats ────────────────────────────────────────────────────

export interface DevStats {
  githubUsername: string;
  avatarUrl: string;
  name: string;
  flavorText: string;
  atk: number;
  def: number;
  hp: number;
  rarity: string;
  primaryLanguage: string;
  topLanguages: string[];
  followers: number;
  totalStars: number;
  starBonus: boolean;
}

/** Only the columns stored in the `Card` table. */
export function toCardData(stats: DevStats) {
  return {
    githubUsername: stats.githubUsername,
    avatarUrl: stats.avatarUrl,
    name: stats.name,
    flavorText: stats.flavorText,
    atk: stats.atk,
    def: stats.def,
    hp: stats.hp,
    rarity: stats.rarity,
    primaryLanguage: stats.primaryLanguage,
  };
}

const MAX_REPO_PAGES = 3;

export function buildDevStats(user: RestUser, repos: RestRepo[]): DevStats {
  let totalStars = 0;
  let totalForks = 0;
  const languages: Record<string, number> = {};

  for (const repo of repos) {
    totalStars += repo.stargazers_count;
    totalForks += repo.forks_count;
    if (repo.language) {
      // Weight the language by repository size to determine dominant language by bytes/code quantity
      languages[repo.language] = (languages[repo.language] || 0) + (repo.size || 1);
    }
  }

  const sortedLangs = Object.keys(languages).sort((a, b) => languages[b] - languages[a]);
  const primaryLanguage = sortedLangs[0] || 'Unknown';
  const topLanguages = sortedLangs.slice(0, 3);

  const accountAgeMs = new Date().getTime() - new Date(user.created_at).getTime();
  const accountAgeYears = accountAgeMs / (1000 * 60 * 60 * 24 * 365.25);

  const { rarity, starBonus } = computeRarity(user.followers, totalStars);

  // Stat formula (STAT_FORMULA) in src/lib/cardStats.ts, tuned with the balance simulator (src/lib/balanceSim.ts)
  const { atk, def, hp } = computeCardStats({
    totalStars,
    totalForks,
    publicRepos: user.public_repos,
    publicGists: user.public_gists || 0,
    followers: user.followers,
    accountAgeYears,
  }, rarity);

  return {
    githubUsername: user.login,
    avatarUrl: user.avatar_url,
    name: user.name || user.login,
    flavorText: user.bio || `Master of the ${primaryLanguage} shadows.`,
    atk,
    def,
    hp,
    rarity,
    primaryLanguage,
    topLanguages,
    followers: user.followers,
    totalStars,
    starBonus,
  };
}

/** Login of the account that owns `token`, or `null` if GitHub rejects it. */
export async function getTokenOwnerLogin(token: string): Promise<string | null> {
  try {
    const { data } = await coreGet<RestUser>('/user', token);
    return data.login;
  } catch (err) {
    if (err instanceof GitHubAuthError) return null;
    throw err;
  }
}

/** Full card stats for a developer, or `null` if the account doesn't exist / isn't a user. */
export async function fetchGitHubUserStats(username: string, token?: string): Promise<DevStats | null> {
  if (!isValidGitHubLogin(username)) return null;

  const cacheKey = `user_stats_${username.toLowerCase()}`;
  const cached = cache.get<DevStats>(cacheKey);
  if (cached) return cached;

  try {
    const { data: user } = await coreGet<RestUser>(`/users/${username}`, token);
    if (user.type !== 'User') return null;

    const repos: RestRepo[] = [];
    const pages = Math.min(MAX_REPO_PAGES, Math.max(1, Math.ceil(user.public_repos / 100)));
    for (let page = 1; page <= pages; page++) {
      const { data } = await coreGet<RestRepo[]>(`/users/${username}/repos?per_page=100&page=${page}`, token);
      repos.push(...data);
      if (data.length < 100) break;
    }

    const stats = buildDevStats(user, repos);
    cache.set(cacheKey, stats);
    return stats;
  } catch (err) {
    if ((err as AxiosError)?.response?.status === 404) return null;
    if (err instanceof GitHubUnavailableError || err instanceof GitHubAuthError) throw err;
    console.error(`Error fetching user ${username}`, (err as Error).message);
    return null;
  }
}
