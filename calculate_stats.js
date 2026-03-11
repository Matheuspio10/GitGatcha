
const axios = require('axios');

async function calculateForUser(username) {
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'node.js'
    };

    try {
        const userRes = await axios.get(`https://api.github.com/users/${username}`, { headers });
        const user = userRes.data;

        const reposRes = await axios.get(`https://api.github.com/users/${username}/repos?per_page=100`, { headers });
        const repos = reposRes.data;

        let totalStars = 0;
        let totalForks = 0;
        const languages = {};

        for (const repo of repos) {
            totalStars += repo.stargazers_count;
            totalForks += repo.forks_count;
            if (repo.language) {
                languages[repo.language] = (languages[repo.language] || 0) + 1;
            }
        }

        const primaryLanguage = Object.keys(languages).sort((a, b) => languages[b] - languages[a])[0] || 'Unknown';
        
        const createdAt = new Date(user.created_at);
        const now = new Date();
        const accountAgeMs = now.getTime() - createdAt.getTime();
        const accountAgeYears = accountAgeMs / (1000 * 60 * 60 * 24 * 365.25);

        const atk = Math.floor((Math.sqrt(totalStars) * 2 + Math.sqrt(totalForks)) * 10) + 10;
        const def = Math.floor(user.public_repos * 15 + (user.public_gists || 0) * 20) + Math.floor(user.followers * 0.5) + 50;
        const hp = Math.floor(accountAgeYears * 50) + Math.floor(user.public_repos * 5) + 200 + Math.floor(atk * 3);

        let rarity = 'Common';
        const score = user.followers * 2 + totalStars;
        if (score > 50000 || (user.company && ['google', 'microsoft', 'vercel', 'facebook', 'meta'].some(c => user.company.toLowerCase().includes(c)))) {
            rarity = 'Legendary';
        } else if (score > 10000) {
            rarity = 'Epic';
        } else if (score > 2500) {
            rarity = 'Rare';
        } else if (score > 500) {
            rarity = 'Uncommon';
        }

        return {
            username: user.login,
            name: user.name || user.login,
            atk,
            def,
            hp,
            rarity,
            primaryLanguage,
            totalStars,
            totalForks,
            followers: user.followers,
            repos: user.public_repos,
            accountAgeYears: accountAgeYears.toFixed(2)
        };

    } catch (err) {
        console.error(`Error for ${username}: ${err.message}`);
        return null;
    }
}

async function main() {
    const users = ['CaioMizerkowski', 'kalliub', 'PINTO0309', 'RainhaVisenya'];
    const allStats = [];
    for (const user of users) {
        const stats = await calculateForUser(user);
        if (stats) allStats.push(stats);
    }
    console.log(JSON.stringify(allStats, null, 2));
}

main();

