import { execSync } from 'node:child_process';

const TEST_DB = 'vitamcore_test';
const TEST_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB}`;

// 1) Crear la BD de test si no existe (idempotente).
const exists = execSync(
  `docker exec vitamcore-postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'"`,
).toString();
if (!exists.includes('1')) {
  execSync(`docker exec vitamcore-postgres psql -U postgres -c "CREATE DATABASE ${TEST_DB}"`, {
    stdio: 'inherit',
  });
}

// 2) Aplicar todas las migraciones a la BD de test.
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: TEST_URL },
});
console.log('BD de test lista.');
