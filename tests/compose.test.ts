import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const environment = {
  ...process.env,
  POSTGRES_PASSWORD: 'configuration-validation-only',
  APP_ORIGIN: 'https://content.example.test',
  PROXY_NETWORK: 'configuration-validation-proxy',
};

function configuration(file: string): any {
  const result = spawnSync('docker', ['compose', '-f', file, 'config', '--format', 'json'], { env: environment, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

test('production Compose independently validates, isolates PostgreSQL, and publishes no host ports', () => {
  const config = configuration('compose.production.yml');
  assert.deepEqual(Object.keys(config.services).sort(), ['app', 'db', 'worker']);
  for (const service of Object.values(config.services) as any[]) {
    assert.equal(service.ports, undefined);
    assert.notEqual(service.network_mode, 'host');
  }
  assert.equal(config.networks.proxy.external, true);
  assert.equal(config.networks.private.internal, true);
  assert.ok(Object.hasOwn(config.services.app.networks,'proxy'));
  assert.equal(config.services.db.networks.proxy, undefined);
  assert.equal(config.services.worker.networks.proxy, undefined);
  assert.ok(Object.hasOwn(config.services.worker.networks,'egress'), 'Web Push needs outbound HTTPS');
  assert.ok(config.services.db.volumes.some((v: any) => v.type === 'volume'));
  assert.ok(config.services.app.volumes.some((v: any) => v.target === '/app/media'));
  assert.ok(config.services.worker.volumes.some((v: any) => v.target === '/app/media'));
  assert.equal(config.services.app.build.target, 'production');
  assert.equal(config.services.worker.build.target, 'production');
});

test('local Compose independently validates and binds only the application to localhost', () => {
  const config = configuration('compose.local.yml');
  assert.equal(config.services.app.ports.length, 1);
  assert.equal(config.services.app.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services.db.ports, undefined);
  assert.equal(config.services.worker.ports, undefined);
  assert.equal(config.services.app.build.target, 'production');
});

test('runtime uses compiled JavaScript and a non-root multistage artifact', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  assert.match(dockerfile, /AS build/i);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /dist\/server\/index\.js/);
});
