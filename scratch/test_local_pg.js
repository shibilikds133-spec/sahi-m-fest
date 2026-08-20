const { Client } = require('pg');

async function test(port) {
  try {
    const client = new Client({
      connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`
    });
    await client.connect();
    console.log(`Connected on port ${port}`);
    await client.end();
  } catch(e) {
    console.log(`Failed on port ${port}:`, e.message);
  }
}

async function run() {
  await test(54322);
  await test(5432);
}
run();
