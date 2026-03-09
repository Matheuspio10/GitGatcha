const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_zdaBxys6f7hC@ep-floral-salad-acuh21xx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require',
  connectionTimeoutMillis: 10000,
});

async function connect() {
  try {
    console.log('Attempting to connect to PostgreSQL...');
    await client.connect();
    console.log('Successfully connected!');
    const res = await client.query('SELECT 1 as result');
    console.log('Query result:', res.rows[0]);
  } catch (err) {
    console.error('Connection error:', err);
  } finally {
    await client.end();
  }
}

connect();
