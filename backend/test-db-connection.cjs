const { Client } = require('pg');

const testConnections = [
  'postgresql://postgres:1111@localhost:5432/QPark',
  'postgresql://postgres:0000@localhost:5432/QPark', 
  'postgresql://postgres:2222@localhost:5432/QPark',
  'postgresql://postgres@localhost:5432/QPark',
  'postgresql://postgres:postgres@localhost:5432/QPark',
  'postgresql://QPark:QPark@localhost:5432/QPark',
  'postgresql://postgres:123456@localhost:5432/QPark',
  'postgresql://postgres:admin@localhost:5432/QPark',
  'postgresql://qpark:qpark@localhost:5432/QPark',
  'postgresql://user:user@localhost:5432/QPark',
  'postgresql://root:root@localhost:5432/QPark',
  'postgresql://postgres:password@localhost:5432/QPark',
  'postgresql://postgres:pass@localhost:5432/QPark',
  'postgresql://postgres:qwerty@localhost:5432/QPark',
  'postgresql://postgres:111111@localhost:5432/QPark',
  'postgresql://postgres:000000@localhost:5432/QPark',
];

async function testConnection(url) {
  const client = new Client({
    connectionString: url,
  });
  
  try {
    await client.connect();
    const result = await client.query('SELECT current_user, current_database()');
    console.log(`✅ SUCCESS: ${url}`);
    console.log(`   User: ${result.rows[0].current_user}`);
    console.log(`   Database: ${result.rows[0].current_database}`);
    await client.end();
    return url;
  } catch (error) {
    console.log(`❌ FAILED: ${url} - ${error.message}`);
    await client.end().catch(() => {});
    return null;
  }
}

async function main() {
  console.log('Testing database connections...\n');
  
  for (const url of testConnections) {
    const success = await testConnection(url);
    if (success) {
      console.log(`\n🎉 Found working connection: ${success}`);
      process.exit(0);
    }
  }
  
  console.log('\n❌ No working connection found');
  process.exit(1);
}

main();
