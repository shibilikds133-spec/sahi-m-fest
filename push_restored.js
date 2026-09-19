const { Client } = require("pg");
const fs = require("fs");

async function run() {
  let sql = fs.readFileSync("restored_trigger.sql", "utf8");
  if (sql.charCodeAt(0) === 0xFEFF) {
    sql = sql.slice(1);
  }
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    console.log("Connected to DB.");
    await client.query(sql);
    console.log("Restored original trigger successfully!");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();
