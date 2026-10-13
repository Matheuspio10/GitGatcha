import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getUserMissions, nextMissionReset, nextWeeklyReset } from '@/lib/economyService';
import { utcDayStart } from '@/lib/missionUtils';
import StoreClient from './StoreClient';

export default async function StorePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/');
  }

  const [missions, extra, github] = await Promise.all([
    getUserMissions(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { missionRerollAt: true } }),
    prisma.account.findFirst({ where: { userId: user.id, provider: 'github' }, select: { id: true } }),
  ]);
  const now = new Date();

  return (
    <StoreClient
      userCurrency={user.currency}
      initialMissions={missions}
      missionsResetInMs={nextMissionReset(now).getTime() - now.getTime()}
      weeklyResetInMs={nextWeeklyReset(now).getTime() - now.getTime()}
      canRerollMission={!extra?.missionRerollAt || extra.missionRerollAt.getTime() < utcDayStart(now).getTime()}
      githubConnected={!!github}
      profileHref={`/profile/${encodeURIComponent(user.username)}`}
    />
  );
}
