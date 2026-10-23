// Imported first by every test file: points the app at the test database before any app
// module reads the environment.
import 'dotenv/config';

const testUrl = process.env['TEST_DATABASE_URL'];
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to backend/.env (see .env.example).');
}
const dbName = new URL(testUrl).pathname.slice(1);
if (!dbName.endsWith('_test')) {
  // Tests truncate tables; refuse to run against anything that is not clearly a test database.
  throw new Error(`TEST_DATABASE_URL must point to a database ending in "_test" (got "${dbName}").`);
}
process.env['DATABASE_URL'] = testUrl;
process.env['NODE_ENV'] = 'test';
