const axios = require('axios');
const fs = require('fs');

let GITHUB_TOKEN = '';
try {
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const match = envFile.match(/GITHUB_TOKEN=([^\n\r]+)/);
  if (match) {
    GITHUB_TOKEN = match[1];
  }
} catch (e) {
  console.log("No .env.local found");
}

const API_BASE = 'https://api.github.com';
const headers = {
  Authorization: GITHUB_TOKEN ? `token ${GITHUB_TOKEN}` : '',
  Accept: 'application/vnd.github.v3+json',
};

async function testQuery(query, label) {
  try {
    const res = await axios.get(`${API_BASE}/search/users?q=${encodeURIComponent(query)}&per_page=1`, { headers });
    console.log(`[${label}] Total count for "${query}": ${res.data.total_count}`);
  } catch (err) {
    console.error(`[${label}] Error: ${err.message}`);
    if (err.response) {
       console.error(err.response.data);
    }
  }
}

async function runTests() {
  await testQuery('type:user language:python followers:<200', 'Python Common (Base)');
  await testQuery('type:user language:python a followers:<200', 'Python Common (With a)');
  await testQuery('type:user language:python z followers:<200', 'Python Common (With z)');
  await testQuery('type:user location:brazil followers:<200', 'Brazil Common (Base)');
  await testQuery('type:user location:brazil a followers:<200', 'Brazil Common (With a)');
}

runTests();
