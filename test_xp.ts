import { grantXP } from './src/lib/xpService.js';
import { prisma } from './src/lib/prisma.js';

async function run() {
  try {
    // Create a dummy user
    const user = await prisma.user.create({
      data: {
        username: 'testuser_' + Date.now(),
        email: 'testuser_' + Date.now() + '@example.com',
        inventory: [],
        currency: 0,
        xp: 0,
        level: 1
      }
    });

    console.log('Created user:', user.id);

    // Grant 45000 XP (Should reach level 59)
    console.log('Granting 45,000 XP...');
    const result = await grantXP(user.id, 45000);
    
    console.log('XP Result:');
    console.log(`Level jumped from ${result.previousLevel} to ${result.newLevel}`);
    console.log(`Earned ${result.levelUps.length} level up rewards`);
    
    // Check DB state
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!updatedUser) throw new Error("Could not find user after update");

    console.log('\n--- Updated User State ---');
    console.log(`Currency: ${updatedUser.currency}`);
    console.log(`Inventory Items:`, (updatedUser.inventory as any[]).length);
    console.log(`Pending Rewards:`, (updatedUser.pendingRewards as any[]).length);
    console.log(`Notifications:`, (updatedUser.notifications as any[]).length);
    
    // Print a specific level up from pending rewards (e.g. level 50)
    const pendingRewards = Array.isArray(updatedUser.pendingRewards) ? updatedUser.pendingRewards as any[] : [];
    const lvl50Reward = pendingRewards.find(r => r.level === 50);
    if (lvl50Reward) {
      console.log('\nLevel 50 Reward check:');
      console.log(lvl50Reward);
    }
    
    // Print the notification check
    const notifications = Array.isArray(updatedUser.notifications) ? updatedUser.notifications as any[] : [];
    const notification = notifications[0];
    if (notification) {
      console.log('\nNotification payload check:');
      console.log('Levels crossed:', notification.payload.levelsCrossed.length);
      console.log('Total Coins in Notification:', notification.payload.totalCoins);
      console.log('Total Packs in Notification:', notification.payload.packNames.length);
    }

    // Cleanup
    await prisma.user.delete({ where: { id: user.id } });
    console.log('\nCleanup done.');
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
