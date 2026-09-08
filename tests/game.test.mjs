import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const compiled = mkdtempSync(join(tmpdir(), 'sora-flight-tests-'));
writeFileSync(join(compiled, 'package.json'), '{"type":"module"}');
execFileSync(process.execPath, [join(projectRoot, 'node_modules/typescript/bin/tsc'), '--ignoreConfig', join(projectRoot, 'src/game.ts'), '--target', 'ES2022', '--module', 'ESNext', '--strict', '--outDir', compiled], { cwd: projectRoot });
const { FlightGame, FLIGHT_RULES } = await import(pathToFileURL(join(compiled, 'game.js')).href);
after(() => rmSync(compiled, { recursive: true, force: true }));

const neutral = { horizontal: 0, vertical: 0, boost: false };
function advance(game, seconds, input = neutral) {
  for (let remaining = seconds; remaining > 0.00001; remaining -= 1 / 60) game.step(Math.min(1 / 60, remaining), input);
}

test('title does not advance, controls bank and climb, pause freezes all game state', () => {
  const game = new FlightGame();
  advance(game, 1);
  assert.equal(game.state.distance, 0);
  game.start();
  advance(game, 1, { horizontal: 1, vertical: 1, boost: false });
  assert.ok(game.state.player.x > 15);
  assert.ok(game.state.player.y > 50);
  assert.ok(game.state.player.roll < -30);
  assert.ok(game.state.player.pitch > 10);
  game.pause();
  const snapshot = structuredClone(game.state);
  advance(game, 2, { horizontal: -1, vertical: -1, boost: true });
  assert.deepEqual(game.state, snapshot);
  game.resume();
  advance(game, 1);
  assert.ok(game.state.distance > snapshot.distance);
});

test('steering remains within corridor and altitude bounds', () => {
  const game = new FlightGame();
  game.start();
  advance(game, 8, { horizontal: 1, vertical: 1, boost: false });
  assert.equal(game.state.player.x, FLIGHT_RULES.lateralLimit);
  assert.equal(game.state.player.y, FLIGHT_RULES.maximumAltitude);
  advance(game, 10, { horizontal: -1, vertical: -1, boost: false });
  assert.equal(game.state.player.x, -FLIGHT_RULES.lateralLimit);
  assert.equal(game.state.player.y, FLIGHT_RULES.minimumAltitude);
});

test('boost depletes, cannot stutter-retrigger until released, and regenerates', () => {
  const game = new FlightGame();
  game.start();
  // Fly clear of rings so a collectible recharge does not affect this energy test.
  game.state.player.x = 35;
  advance(game, 1, { ...neutral, boost: true });
  assert.ok(game.state.speed > 43);
  assert.ok(game.state.energy < 76 && game.state.energy > 74);
  advance(game, 4, { ...neutral, boost: true });
  assert.equal(game.state.boosting, false);
  assert.ok(game.state.energy > 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'boost').length, 1);
  advance(game, 1, neutral);
  const energy = game.state.energy;
  advance(game, 0.2, { ...neutral, boost: true });
  assert.equal(game.state.boosting, true);
  assert.ok(game.state.energy < energy);
});

test('rings detect swept plane crossing, award once, and missed rings break combo', () => {
  const game = new FlightGame();
  game.start();
  const first = game.rings[0];
  game.state.player.z = first.z + 0.1;
  game.step(1 / 60, neutral);
  assert.equal(first.collected, true);
  assert.equal(game.state.ringsCollected, 1);
  assert.equal(game.state.combo, 1);
  advance(game, 1);
  assert.equal(game.state.ringsCollected, 1);
  const second = game.rings[1];
  game.state.player.z = second.z + 0.1;
  game.state.player.x = 30;
  game.step(1 / 60, neutral);
  assert.equal(second.missed, true);
  assert.equal(game.state.ringsMissed, 1);
  assert.equal(game.state.combo, 0);
  const events = game.drainEvents();
  assert.equal(events.filter(event => event.type === 'ring').length, 1);
  assert.equal(events.filter(event => event.type === 'miss').length, 1);
  assert.deepEqual(game.drainEvents(), []);
});

test('obstacle collision respects invulnerability and ends journey at three separate hits', () => {
  const game = new FlightGame();
  game.setObstacles([
    { x: 0, y: 36, z: -10, w: 14, h: 14, d: 5 },
    { x: 0, y: 36, z: -90, w: 14, h: 14, d: 5 },
    { x: 0, y: 36, z: -180, w: 14, h: 14, d: 5 },
  ]);
  game.start();
  advance(game, 0.5);
  assert.equal(game.state.health, 2);
  assert.ok(game.state.invulnerable > 0);
  advance(game, 0.5);
  assert.equal(game.state.health, 2);
  advance(game, 10);
  assert.equal(game.state.health, 0);
  assert.equal(game.state.status, 'lost');
  const end = game.state.distance;
  advance(game, 1);
  assert.equal(game.state.distance, end);
  assert.equal(game.drainEvents().filter(event => event.type === 'lose').length, 1);
});

test('a skilled full course completes all rings with S rank and deterministic restart', () => {
  const game = new FlightGame();
  game.start();
  for (let frame = 0; frame < 60 * 130 && game.state.status === 'playing'; frame += 1) {
    const next = game.rings.find(ring => !ring.collected && !ring.missed);
    const p = game.state.player;
    game.step(1 / 60, {
      horizontal: next ? Math.max(-1, Math.min(1, (next.x - p.x) / 7)) : 0,
      vertical: next ? Math.max(-1, Math.min(1, (next.y - p.y) / 7)) : 0,
      boost: false,
    });
  }
  assert.equal(game.state.status, 'won');
  assert.equal(game.state.distance, 3000);
  assert.equal(game.state.ringsCollected, 30);
  assert.equal(game.state.rank, 'S');
  assert.ok(game.state.score > 10000);
  assert.ok(game.state.elapsed < 112);
  game.restart();
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.distance, 0);
  assert.equal(game.state.score, 0);
  assert.equal(game.state.health, 3);
  assert.equal(game.state.ringsCollected, 0);
  assert.ok(game.rings.every(ring => !ring.collected && !ring.missed));
});

test('free mode keeps flying past the course and recycles ring positions', () => {
  const game = new FlightGame();
  game.start('free');
  const ringId = game.rings[0].id;
  advance(game, 120);
  assert.equal(game.state.status, 'playing');
  assert.ok(game.state.distance > 3000);
  assert.equal(game.rings[0].id, ringId);
  assert.ok(game.rings[0].z < -3000);
});

test('bad frame deltas cannot poison simulation or jump the complete course', () => {
  const game = new FlightGame();
  game.start();
  game.step(Number.NaN, neutral);
  game.step(-1, neutral);
  assert.equal(game.state.distance, 0);
  game.step(900, { horizontal: Number.NaN, vertical: Number.POSITIVE_INFINITY, boost: false });
  assert.ok(game.state.distance < 10);
  assert.equal(game.state.player.x, 0);
  assert.equal(game.state.player.y, 36);
});

test('free flight repeats city collisions every 3500m without depleting health', () => {
  const game = new FlightGame();
  const baseObstacle = { x: 0, y: 36, z: -10, w: 20, h: 20, d: 5 };
  game.setObstacles([baseObstacle]);
  game.setObstacleLoopLength(3500);
  // Changes to the renderer's source data must not move the authoritative collider.
  baseObstacle.x = 500;
  game.start('free');
  advance(game, 266);
  const hits = game.drainEvents().filter(event => event.type === 'hit');
  assert.equal(hits.length, 3);
  assert.ok(Math.abs(hits[0].z + 6.25) < 1);
  assert.ok(Math.abs(hits[1].z + 3506.25) < 1);
  assert.ok(Math.abs(hits[2].z + 7006.25) < 1);
  assert.equal(game.state.health, 3);
  assert.equal(game.state.status, 'playing');
});

test('journey ignores city repetition configuration and restart clears collision history', () => {
  const game = new FlightGame();
  game.setObstacles([{ x: 0, y: 36, z: -10, w: 20, h: 20, d: 5 }]);
  game.setObstacleLoopLength(100);
  game.start('journey');
  advance(game, 10);
  assert.equal(game.state.health, 2);
  assert.equal(game.drainEvents().filter(event => event.type === 'hit').length, 1);
  game.restart();
  advance(game, 1);
  assert.equal(game.state.health, 2);
  assert.equal(game.drainEvents().filter(event => event.type === 'hit').length, 1);
});

test('ring collection uses plane-crossing position even during a long steering frame', () => {
  const miss = new FlightGame();
  miss.start();
  miss.rings[0].z = -1;
  miss.state.player.x = 10;
  miss.state.player.vx = -25;
  miss.step(0.25, { horizontal: -1, vertical: 0, boost: false });
  assert.ok(miss.state.player.x < miss.rings[0].radius);
  assert.equal(miss.rings[0].missed, true);
  assert.equal(miss.state.ringsCollected, 0);

  const collect = new FlightGame();
  collect.start();
  collect.rings[0].z = -1;
  collect.state.player.x = 2;
  collect.state.player.vx = 25;
  collect.step(0.25, { horizontal: 1, vertical: 0, boost: false });
  assert.ok(collect.state.player.x > collect.rings[0].radius);
  assert.equal(collect.rings[0].collected, true);
});

test('weather preference survives restart and difficulty multiplies collected-ring scores', () => {
  for (const [weather, multiplier, points] of [['clear', 1, 150], ['rain', 1.25, 188], ['snow', 1.5, 225], ['storm', 2, 300]]) {
    const game = new FlightGame();
    game.setWeather(weather);
    game.start();
    game.rings[0].z = -0.1;
    game.step(1 / 60, neutral);
    assert.equal(game.state.weather, weather);
    assert.equal(game.state.weatherMultiplier, multiplier);
    assert.equal(game.drainEvents().find(event => event.type === 'ring')?.value, points);
    game.restart();
    assert.equal(game.state.weather, weather);
    assert.equal(game.state.deliveryTask.progress, 0);
    assert.equal(game.state.tasksCompleted, 0);
    assert.equal(game.state.stormTarget, null);
  }
});

test('rain produces controllable drift and snow trades speed and recharge for higher scoring', () => {
  const clear = new FlightGame();
  const rain = new FlightGame();
  const snow = new FlightGame();
  rain.setWeather('rain');
  snow.setWeather('snow');
  for (const game of [clear, rain, snow]) { game.start(); game.state.energy = 50; advance(game, 2); }
  assert.equal(clear.state.player.x, 0);
  assert.ok(rain.state.player.x > 1);
  assert.ok(Math.abs(rain.state.windX) <= 2.7);
  assert.ok(snow.state.distance < clear.state.distance * 0.91);
  assert.ok(snow.state.energy < clear.state.energy - 5);
  advance(rain, 1, { horizontal: -1, vertical: 0, boost: false });
  assert.ok(rain.state.player.x < 0, 'steering must overcome weather drift');
});

function firstStormWarning(game) {
  for (let frame = 0; frame < 60 * 7 && !game.state.stormTarget; frame += 1) game.step(1 / 60, neutral);
  assert.ok(game.state.stormTarget);
  return structuredClone(game.state.stormTarget);
}
function flyThroughStormPlane(game, target, offsetX = 0) {
  for (let frame = 0; frame < 60 * 8 && game.state.lightningFlash === 0; frame += 1) {
    const p = game.state.player;
    game.step(1 / 60, {
      horizontal: Math.max(-1, Math.min(1, (target.x + offsetX - p.x) / 6 - game.state.windX / 25)),
      vertical: Math.max(-1, Math.min(1, (target.y - p.y) / 6 - game.state.windY / 21)),
      boost: false,
    });
  }
  assert.ok(game.state.lightningFlash > 0);
}

test('storm warning is early, stationary, freezes while paused, and can be dodged', () => {
  const game = new FlightGame();
  game.setWeather('storm');
  game.start();
  advance(game, 4.9);
  assert.equal(game.state.stormTarget, null);
  const target = firstStormWarning(game);
  assert.ok(game.state.player.z - target.z > 104);
  assert.ok(game.state.stormWarning > 3);
  assert.equal(game.state.health, 3);
  game.pause();
  const paused = structuredClone(game.state);
  advance(game, 3, { horizontal: 1, vertical: 1, boost: true });
  assert.deepEqual(game.state, paused);
  game.resume();
  game.step(1 / 60, { horizontal: 1, vertical: 0, boost: false });
  assert.deepEqual(game.state.stormTarget, target, 'hazard must not track evasive motion');
  flyThroughStormPlane(game, target, 16);
  assert.equal(game.state.health, 3);
  assert.equal(game.state.stormWarning, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'lightning').length, 1);
  advance(game, 0.5);
  assert.equal(game.state.stormTarget, null);
  assert.equal(game.state.lightningFlash, 0);
});

test('lightning affects only its marked zone, respects immunity, and remains nonlethal in free mode', () => {
  for (const [mode, immune, expectedHealth] of [['journey', false, 2], ['journey', true, 3], ['free', false, 3]]) {
    const game = new FlightGame();
    game.setWeather('storm');
    game.start(mode);
    const target = firstStormWarning(game);
    if (immune) game.state.invulnerable = 10;
    flyThroughStormPlane(game, target);
    assert.equal(game.state.health, expectedHealth);
    assert.equal(game.state.status, 'playing');
    const events = game.drainEvents();
    assert.equal(events.filter(event => event.type === 'lightning').length, 1);
    assert.equal(events.filter(event => event.type === 'hit').length, immune ? 0 : 1);
    advance(game, 0.2);
    assert.equal(game.state.health, expectedHealth, 'one strike cannot damage repeatedly');
  }
});

test('changing weather clears a pending strike and storm gusts never overpower full steering', () => {
  const game = new FlightGame();
  game.setWeather('storm');
  game.start('free');
  firstStormWarning(game);
  game.setWeather('clear');
  assert.equal(game.state.stormTarget, null);
  assert.equal(game.state.stormWarning, 0);
  advance(game, 5);
  assert.equal(game.drainEvents().filter(event => event.type === 'lightning').length, 0);
  game.setWeather('storm');
  for (let frame = 0; frame < 60 * 12; frame += 1) {
    game.step(1 / 60, { horizontal: 1, vertical: 0, boost: false });
    assert.ok(Math.abs(game.state.windX) <= 6);
    assert.ok(Math.abs(game.state.windY) <= 1.5);
  }
  assert.equal(game.state.player.x, FLIGHT_RULES.lateralLimit);
});

function collectCentered(game, ring) {
  Object.assign(game.state.player, { x: ring.x, y: ring.y, z: ring.z + 0.05, vx: 0, vy: 0 });
  game.step(1 / 60, neutral);
  assert.equal(ring.collected, true);
}

test('delivery contracts award once, pause progress, and rotate through rings, boost, and perfect flight', () => {
  const game = new FlightGame();
  game.start('free');
  for (const ring of game.rings.slice(0, 5)) collectCentered(game, ring);
  assert.equal(game.state.deliveryTask.id, 'rings');
  assert.equal(game.state.deliveryTask.completed, true);
  assert.equal(game.state.tasksCompleted, 1);
  assert.deepEqual(game.drainEvents().filter(event => event.type === 'task').map(event => event.value), [600]);
  advance(game, 3.1);
  assert.equal(game.state.deliveryTask.id, 'boost');
  advance(game, 1, { ...neutral, boost: true });
  assert.ok(game.state.deliveryTask.progress > 30);
  game.pause();
  const paused = structuredClone(game.state.deliveryTask);
  advance(game, 5, { ...neutral, boost: true });
  assert.deepEqual(game.state.deliveryTask, paused);
  game.resume();
  for (let frame = 0; frame < 60 * 45 && !game.state.deliveryTask.completed; frame += 1) {
    game.step(1 / 60, { ...neutral, boost: (frame / 60) % 7 < 4 });
  }
  assert.equal(game.state.deliveryTask.progress, 300);
  assert.equal(game.state.tasksCompleted, 2);
  assert.deepEqual(game.drainEvents().filter(event => event.type === 'task').map(event => event.value), [800]);
  advance(game, 3.1);
  assert.equal(game.state.deliveryTask.id, 'perfect');
  const nextThree = game.rings.filter(ring => !ring.collected && !ring.missed && ring.z < game.state.player.z).slice(0, 3);
  assert.equal(nextThree.length, 3);
  for (const ring of nextThree) collectCentered(game, ring);
  assert.equal(game.state.deliveryTask.completed, true);
  assert.equal(game.state.tasksCompleted, 3);
  assert.deepEqual(game.drainEvents().filter(event => event.type === 'task').map(event => event.value), [1000]);
  advance(game, 3.1);
  assert.equal(game.state.deliveryTask.id, 'rings');
  assert.equal(game.state.deliveryTask.progress, 0);
  assert.equal(game.state.deliveryTask.completed, false);
  assert.equal(game.drainEvents().filter(event => event.type === 'task').length, 0);
});
