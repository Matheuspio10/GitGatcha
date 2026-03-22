import { prisma } from './src/lib/prisma';
import { resolveFriendBattle, resolveRandomBattle } from './src/lib/battleService';

async function setup() {
    const challenger = await prisma.user.create({
        data: {
            username: "challenger_test",
        }
    });

    const defender = await prisma.user.create({
        data: {
            username: "defender_test",
        }
    });

    const cardData = {
        githubUsername: "test_card",
        name: "Test Card",
        flavorText: "Test Flavor",
        atk: 10,
        def: 10,
        hp: 100,
        rarity: "common",
    };

    const cCard1 = await prisma.card.create({ data: { ...cardData, githubUsername: "test_c1" }});
    const cCard2 = await prisma.card.create({ data: { ...cardData, githubUsername: "test_c2" }});
    const cCard3 = await prisma.card.create({ data: { ...cardData, githubUsername: "test_c3" }});
    const dCard1 = await prisma.card.create({ data: { ...cardData, githubUsername: "test_d1" }});
    const dCard2 = await prisma.card.create({ data: { ...cardData, githubUsername: "test_d2" }});
    const dCard3 = await prisma.card.create({ data: { ...cardData, githubUsername: "test_d3" }});

    const ucCardData = { quantity: 1, stamina: 100 };
    const uc1 = await prisma.userCard.create({ data: { ...ucCardData, userId: challenger.id, cardId: cCard1.id, inActiveTeam: true }});
    const uc2 = await prisma.userCard.create({ data: { ...ucCardData, userId: challenger.id, cardId: cCard2.id, inActiveTeam: true }});
    const uc3 = await prisma.userCard.create({ data: { ...ucCardData, userId: challenger.id, cardId: cCard3.id, inActiveTeam: true }});
    const ud1 = await prisma.userCard.create({ data: { ...ucCardData, userId: defender.id, cardId: dCard1.id, inActiveTeam: true }});
    const ud2 = await prisma.userCard.create({ data: { ...ucCardData, userId: defender.id, cardId: dCard2.id, inActiveTeam: true }});
    const ud3 = await prisma.userCard.create({ data: { ...ucCardData, userId: defender.id, cardId: dCard3.id, inActiveTeam: true }});

    const challengerTeamCards = [uc1, uc2, uc3].map(uc => ({
        ...uc,
        ...cCard1, // roughly right for test
        id: uc.id,
    }));

    const defenderTeamCards = [ud1, ud2, ud3].map(ud => ({
        ...ud,
        ...dCard1,
        id: ud.id,
    }));

    return { challenger, defender, challengerTeamCards, defenderTeamCards };
}

async function run() {
    console.log("Setting up...");
    const { challenger, defender, challengerTeamCards, defenderTeamCards } = await setup();

    console.log("Running baseline benchmark...");
    const numRuns = 10;

    const start = Date.now();
    for (let i = 0; i < numRuns; i++) {
        // Just resolve random battle to hit incrementLoyaltyAndCheck N+1
        await resolveRandomBattle(challenger.id, challengerTeamCards, 'OPEN');
    }
    const end = Date.now();

    console.log(`Average time per random battle: ${(end - start) / numRuns}ms`);

    const start2 = Date.now();
    for (let i = 0; i < numRuns; i++) {
        const battle = await prisma.battle.create({
            data: {
                challengerId: challenger.id,
                defenderId: defender.id,
                status: 'PENDING',
                challengerTeam: challengerTeamCards as any,
            }
        });
        await resolveFriendBattle(battle.id, defenderTeamCards);
    }
    const end2 = Date.now();
    console.log(`Average time per friend battle: ${(end2 - start2) / numRuns}ms`);

    // cleanup
    console.log("Cleaning up...");
    await prisma.battle.deleteMany({});
    await prisma.userCard.deleteMany({});
    await prisma.card.deleteMany({});
    await prisma.user.deleteMany({});
}

run().catch(console.error).finally(() => process.exit(0));
