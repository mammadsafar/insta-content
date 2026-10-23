// Integration tests write fixtures and exercise cleanup: never point them at user data.
const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('Set DATABASE_URL to an isolated database whose name ends in _test. Use npm run test:unit for database-free checks.');
const target = new URL(connection);
if (!decodeURIComponent(target.pathname).endsWith('_test')) throw new Error('Refusing integration tests: database name must end in _test.');
