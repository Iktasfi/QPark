const fs = require('fs');
const { execSync } = require('child_process');

console.log('🔍 Checking PostgreSQL configuration...\n');

// Check PostgreSQL processes
try {
  const processes = execSync('ps aux | grep postgres', { encoding: 'utf8' });
  console.log('📋 PostgreSQL processes:');
  console.log(processes);
} catch (error) {
  console.log('❌ Could not get PostgreSQL processes');
}

// Check running PostgreSQL instances
try {
  const instances = execSync('lsof -i :5432', { encoding: 'utf8' });
  console.log('\n🌐 PostgreSQL instances on port 5432:');
  console.log(instances);
} catch (error) {
  console.log('❌ Could not get PostgreSQL instances');
}

// Check pg_hba.conf
try {
  const hbaConf = fs.readFileSync('/opt/homebrew/var/postgresql@14/pg_hba.conf', 'utf8');
  console.log('\n📄 pg_hba.conf (last 10 lines):');
  console.log(hbaConf.split('\n').slice(-10).join('\n'));
} catch (error) {
  console.log('❌ Could not read pg_hba.conf');
}

// Check postgresql.conf for port
try {
  const confFiles = [
    '/opt/homebrew/var/postgresql@14/postgresql.conf',
    '/Library/PostgreSQL/18/data/postgresql.conf'
  ];
  
  for (const confFile of confFiles) {
    try {
      const conf = fs.readFileSync(confFile, 'utf8');
      const portMatch = conf.match(/port\s*=\s*(\d+)/);
      if (portMatch) {
        console.log(`\n🔧 PostgreSQL port from ${confFile}: ${portMatch[1]}`);
        break;
      }
    } catch (error) {
      // Continue to next file
    }
  }
} catch (error) {
  console.log('❌ Could not check PostgreSQL config');
}

// Try to connect with different methods
console.log('\n🔌 Testing connection methods...');

const testMethods = [
  { method: 'psql -U postgres -h localhost -d QPark', desc: 'Direct psql connection' },
  { method: 'psql -U postgres -h localhost -l', desc: 'List databases' },
];

for (const test of testMethods) {
  try {
    const result = execSync(test.method, { 
      encoding: 'utf8', 
      timeout: 3000,
      stdio: 'pipe'
    });
    console.log(`✅ ${test.desc}: SUCCESS`);
    if (result.trim()) {
      console.log(`   Result: ${result.trim().split('\n')[0]}`);
    }
  } catch (error) {
    console.log(`❌ ${test.desc}: FAILED`);
  }
}

console.log('\n🎯 Recommendation: Check if PostgreSQL requires password or if user is different');
