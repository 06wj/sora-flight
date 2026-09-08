/** All gameplay authority lives here; this module deliberately has no DOM or engine imports. */
export type GameStatus = 'title' | 'playing' | 'paused' | 'won' | 'lost';
export type FlightMode = 'journey' | 'free';
export type FlightRank = 'S' | 'A' | 'B' | 'C';
export type WeatherMode = 'clear' | 'rain' | 'snow' | 'storm';
export type DeliveryTaskId = 'rings' | 'boost' | 'perfect';

export interface StormTarget {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface DeliveryTask {
  id: DeliveryTaskId;
  name: string;
  progress: number;
  target: number;
  completed: boolean;
}

export interface InputState {
  horizontal: number;
  vertical: number;
  boost: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  /** Presentation rotations in degrees. */
  roll: number;
  pitch: number;
}

export interface GameState {
  status: GameStatus;
  mode: FlightMode;
  player: PlayerState;
  elapsed: number;
  distance: number;
  speed: number;
  energy: number;
  health: number;
  score: number;
  combo: number;
  bestCombo: number;
  ringsCollected: number;
  ringsMissed: number;
  totalRings: number;
  targetRings: number;
  routeLength: number;
  invulnerable: number;
  boosting: boolean;
  rank: FlightRank;
  nearMisses: number;
  weather: WeatherMode;
  windX: number;
  windY: number;
  weatherMultiplier: number;
  /** Estimated seconds to the marked lightning plane; zero means no pending strike. */
  stormWarning: number;
  lightningFlash: number;
  stormTarget: StormTarget | null;
  deliveryTask: DeliveryTask;
  tasksCompleted: number;
}

export interface FlightRing {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  collected: boolean;
  missed: boolean;
}

/** The position is the center of the obstacle, including the vertical coordinate. */
export interface FlightObstacle {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export type FlightEventType = 'ring' | 'perfect' | 'miss' | 'hit' | 'nearMiss' | 'boost' | 'lightning' | 'task' | 'win' | 'lose' | 'start' | 'pause' | 'resume';
export interface FlightEvent {
  type: FlightEventType;
  x: number;
  y: number;
  z: number;
  value?: number;
}

export const FLIGHT_RULES = Object.freeze({
  baseSpeed: 27,
  boostSpeed: 45,
  routeLength: 3000,
  totalRings: 30,
  targetRings: 18,
  minimumAltitude: 8,
  maximumAltitude: 100,
  lateralLimit: 38,
  playerRadius: 1.25,
  invulnerabilitySeconds: 2.4,
});

export const WEATHER_RULES: Readonly<Record<WeatherMode, Readonly<{ multiplier: number; speed: number; recharge: number; boostCost: number }>>> = Object.freeze({
  clear: Object.freeze({ multiplier: 1, speed: 1, recharge: 10, boostCost: 25 }),
  rain: Object.freeze({ multiplier: 1.25, speed: 1, recharge: 10, boostCost: 25 }),
  snow: Object.freeze({ multiplier: 1.5, speed: 0.86, recharge: 7, boostCost: 25 }),
  storm: Object.freeze({ multiplier: 2, speed: 0.96, recharge: 8, boostCost: 28 }),
});

const DELIVERY_TASKS: readonly Readonly<{ id: DeliveryTaskId; name: string; target: number; reward: number }>[] = [
  { id: 'rings', name: '收集风的来信', target: 5, reward: 600 },
  { id: 'boost', name: '乘风加急投递', target: 300, reward: 800 },
  { id: 'perfect', name: '瞄准风环中心', target: 3, reward: 1000 },
];

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const smooth = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));
const finiteAxis = (value: number): number => Number.isFinite(value) ? clamp(value, -1, 1) : 0;

function makeDeliveryTask(index = 0): DeliveryTask {
  const task = DELIVERY_TASKS[index % DELIVERY_TASKS.length]!;
  return { id: task.id, name: task.name, progress: 0, target: task.target, completed: false };
}

function makeState(mode: FlightMode = 'journey', weather: WeatherMode = 'clear'): GameState {
  return {
    status: 'title', mode,
    player: { x: 0, y: 36, z: 0, vx: 0, vy: 0, roll: 0, pitch: 0 },
    elapsed: 0, distance: 0, speed: FLIGHT_RULES.baseSpeed, energy: 100,
    health: 3, score: 0, combo: 0, bestCombo: 0,
    ringsCollected: 0, ringsMissed: 0, totalRings: FLIGHT_RULES.totalRings,
    targetRings: FLIGHT_RULES.targetRings, routeLength: FLIGHT_RULES.routeLength,
    invulnerable: 0, boosting: false, rank: 'C', nearMisses: 0,
    weather, windX: 0, windY: 0, weatherMultiplier: WEATHER_RULES[weather].multiplier,
    stormWarning: 0, lightningFlash: 0, stormTarget: null,
    deliveryTask: makeDeliveryTask(), tasksCompleted: 0,
  };
}

/** The first two rings teach straight flight, then the course draws a gentle slalom. */
function makeRing(id: number): FlightRing {
  const waveIndex = Math.max(0, id - 1);
  return {
    id,
    x: id < 2 ? 0 : Math.sin(waveIndex * 0.69) * 17,
    y: id < 2 ? 36 : 37 + Math.sin(waveIndex * 0.48) * 11,
    z: -(115 + id * 94),
    radius: 6.5,
    collected: false,
    missed: false,
  };
}

export class FlightGame {
  state: GameState = makeState();
  readonly rings: FlightRing[] = Array.from({ length: FLIGHT_RULES.totalRings }, (_, i) => makeRing(i));
  private obstacles: FlightObstacle[] = [];
  private obstacleHits = new Set<number>();
  private obstaclePassed = new Set<number>();
  private obstacleCycles: number[] = [];
  private obstacleLoopLength = 0;
  private events: FlightEvent[] = [];
  private boostDepleted = false;
  private damageSlowdown = 0;
  private distanceScore = 0;
  private weatherPreference: WeatherMode = 'clear';
  private stormCooldown = 5;
  private stormStruck = false;
  private stormSequence = 0;
  private taskIndex = 0;
  private taskHold = 0;

  /** Weather is a player preference; changing it never resets a flight or its contracts. */
  setWeather(mode: WeatherMode): void {
    if (!Object.hasOwn(WEATHER_RULES, mode) || mode === this.weatherPreference) return;
    this.weatherPreference = mode;
    this.state.weather = mode;
    this.state.weatherMultiplier = WEATHER_RULES[mode].multiplier;
    this.state.stormTarget = null;
    this.state.stormWarning = 0;
    this.state.lightningFlash = 0;
    this.stormCooldown = 5;
    this.stormStruck = false;
  }

  setObstacles(obstacles: readonly FlightObstacle[]): void {
    this.obstacles = obstacles.filter(o => [o.x, o.y, o.z, o.w, o.h, o.d].every(Number.isFinite) && o.w > 0 && o.h > 0 && o.d > 0).map(o => ({ ...o }));
    this.obstacleHits.clear();
    this.obstaclePassed.clear();
    this.obstacleCycles = this.obstacles.map(() => 0);
  }

  /** Match repeated scenery at base z − N × length in free mode; zero disables looping. */
  setObstacleLoopLength(length: number): void {
    this.obstacleLoopLength = Number.isFinite(length) && length > 0 ? length : 0;
    this.obstacleHits.clear();
    this.obstaclePassed.clear();
    this.obstacleCycles = this.obstacles.map(() => 0);
  }

  start(mode: FlightMode = 'journey'): void {
    this.state = makeState(mode, this.weatherPreference);
    this.state.status = 'playing';
    this.rings.splice(0, this.rings.length, ...Array.from({ length: FLIGHT_RULES.totalRings }, (_, i) => makeRing(i)));
    this.obstacleHits.clear();
    this.obstaclePassed.clear();
    this.obstacleCycles = this.obstacles.map(() => 0);
    this.events.length = 0;
    this.boostDepleted = false;
    this.damageSlowdown = 0;
    this.distanceScore = 0;
    this.stormCooldown = 5;
    this.stormStruck = false;
    this.stormSequence = 0;
    this.taskIndex = 0;
    this.taskHold = 0;
    this.emit('start');
  }

  restart(): void { this.start(this.state.mode); }

  pause(): void {
    if (this.state.status !== 'playing') return;
    this.state.status = 'paused';
    this.state.boosting = false;
    this.emit('pause');
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.state.status = 'playing';
    this.emit('resume');
  }

  /** Atomically consume transient events; retaining these outside simulation is presentation's job. */
  drainEvents(): FlightEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** dt is seconds. Long browser gaps are capped, then substepped to avoid tunnelling. */
  step(dt: number, input: InputState): void {
    if (this.state.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    const frameDelta = Math.min(dt, 0.25);
    const steps = Math.ceil(frameDelta / (1 / 120));
    const stepDelta = frameDelta / steps;
    const normalizedInput: InputState = {
      horizontal: finiteAxis(input.horizontal), vertical: finiteAxis(input.vertical), boost: Boolean(input.boost),
    };
    for (let i = 0; i < steps && this.state.status === 'playing'; i += 1) this.integrate(stepDelta, normalizedInput);
  }

  private integrate(dt: number, input: InputState): void {
    const s = this.state;
    const p = s.player;
    const previousX = p.x;
    const previousY = p.y;
    const previousZ = p.z;
    s.elapsed += dt;
    s.invulnerable = Math.max(0, s.invulnerable - dt);
    this.damageSlowdown = Math.max(0, this.damageSlowdown - dt);
    this.updateWeather(dt);
    if (this.taskHold > 0) {
      this.taskHold = Math.max(0, this.taskHold - dt);
      if (this.taskHold === 0) {
        this.taskIndex = (this.taskIndex + 1) % DELIVERY_TASKS.length;
        s.deliveryTask = makeDeliveryTask(this.taskIndex);
      }
    }

    if (!input.boost) this.boostDepleted = false;
    if (s.energy <= 0.01) this.boostDepleted = true;
    const boosting = input.boost && !this.boostDepleted && s.energy > 0.01;
    if (boosting && !s.boosting) this.emit('boost');
    s.boosting = boosting;
    const weather = WEATHER_RULES[s.weather];
    s.energy = clamp(s.energy + (boosting ? -weather.boostCost : weather.recharge) * dt, 0, 100);
    const targetSpeed = this.damageSlowdown > 0 ? 16 : (boosting ? FLIGHT_RULES.boostSpeed : FLIGHT_RULES.baseSpeed) * weather.speed;
    s.speed = smooth(s.speed, targetSpeed, 3.8, dt);

    const lateralSpeed = boosting ? 28 : 25;
    p.vx = smooth(p.vx, input.horizontal * lateralSpeed + s.windX, 6.5, dt);
    p.vy = smooth(p.vy, input.vertical * 21 + s.windY, 6.5, dt);
    p.x = clamp(p.x + p.vx * dt, -FLIGHT_RULES.lateralLimit, FLIGHT_RULES.lateralLimit);
    p.y = clamp(p.y + p.vy * dt, FLIGHT_RULES.minimumAltitude, FLIGHT_RULES.maximumAltitude);
    if (Math.abs(p.x) >= FLIGHT_RULES.lateralLimit) p.vx = 0;
    if (p.y === FLIGHT_RULES.minimumAltitude || p.y === FLIGHT_RULES.maximumAltitude) p.vy = 0;
    p.z -= s.speed * dt;
    p.roll = smooth(p.roll, -input.horizontal * 35 - s.windX * 1.1, 5, dt);
    p.pitch = smooth(p.pitch, input.vertical * 12 + (boosting ? -4 : 0), 5, dt);
    s.distance = -p.z;
    if (boosting) this.progressTask('boost', previousZ - p.z);

    // Award distance only on integer 10m thresholds, never as floating point frame increments.
    const distanceScore = Math.floor(s.distance / 10);
    if (distanceScore > this.distanceScore) s.score += distanceScore - this.distanceScore;
    this.distanceScore = distanceScore;

    this.checkRings(previousX, previousY, previousZ);
    this.checkObstacles(previousZ);
    if (s.status === 'playing') this.checkStorm(previousX, previousY, previousZ);
    s.rank = s.ringsCollected >= 27 && s.health === 3 ? 'S' : s.ringsCollected >= 23 ? 'A' : s.ringsCollected >= s.targetRings ? 'B' : 'C';
    if (s.status !== 'playing') return;
    if (s.mode === 'journey' && s.distance >= s.routeLength) {
      s.distance = s.routeLength;
      p.z = -s.routeLength;
      s.status = 'won';
      s.boosting = false;
      s.score += s.health * 300 + Math.max(0, Math.round((120 - s.elapsed) * 10));
      this.emit('win', s.score);
    } else if (s.mode === 'free') {
      // Preserve ring identity for renderers while recycling each collected/missed ring ahead.
      for (const ring of this.rings) {
        if (ring.z > p.z + 120) {
          ring.z -= FLIGHT_RULES.totalRings * 94;
          ring.collected = false;
          ring.missed = false;
        }
      }
    }
  }

  private checkRings(previousX: number, previousY: number, previousZ: number): void {
    const s = this.state;
    const p = s.player;
    for (const ring of this.rings) {
      if (ring.collected || ring.missed || previousZ < ring.z || p.z > ring.z) continue;
      const fraction = clamp((previousZ - ring.z) / Math.max(0.00001, previousZ - p.z), 0, 1);
      const crossingX = previousX + (p.x - previousX) * fraction;
      const crossingY = previousY + (p.y - previousY) * fraction;
      const offset = Math.hypot(crossingX - ring.x, crossingY - ring.y);
      if (offset <= ring.radius) {
        ring.collected = true;
        s.ringsCollected += 1;
        s.combo += 1;
        s.bestCombo = Math.max(s.bestCombo, s.combo);
        const perfect = offset < ring.radius * 0.42;
        const points = Math.round((perfect ? 150 : 100) * Math.min(5, 1 + Math.floor(s.combo / 4)) * s.weatherMultiplier);
        s.score += points;
        s.energy = Math.min(100, s.energy + 14);
        this.events.push({ type: 'ring', x: ring.x, y: ring.y, z: ring.z, value: points });
        this.progressTask('rings', 1);
        if (perfect) {
          this.events.push({ type: 'perfect', x: ring.x, y: ring.y, z: ring.z, value: points });
          this.progressTask('perfect', 1);
        }
      } else {
        ring.missed = true;
        s.ringsMissed += 1;
        s.combo = 0;
        this.events.push({ type: 'miss', x: ring.x, y: ring.y, z: ring.z });
      }
    }
  }

  private checkObstacles(previousZ: number): void {
    const s = this.state;
    const p = s.player;
    const radius = FLIGHT_RULES.playerRadius;
    for (let index = 0; index < this.obstacles.length; index += 1) {
      const obstacle = this.obstacles[index];
      if (!obstacle) continue;
      const halfW = obstacle.w / 2;
      const halfH = obstacle.h / 2;
      const halfD = obstacle.d / 2;
      // Keep the current instance until its far face has cleared the entire player.
      // After that, use the next copy ahead. This also handles a loop boundary mid-frame.
      const cycle = s.mode === 'free' && this.obstacleLoopLength > 0
        ? Math.max(0, Math.ceil((obstacle.z - halfD - radius - p.z) / this.obstacleLoopLength))
        : 0;
      if (cycle !== this.obstacleCycles[index]) {
        this.obstacleCycles[index] = cycle;
        this.obstacleHits.delete(index);
        this.obstaclePassed.delete(index);
      }
      if (this.obstaclePassed.has(index)) continue;
      const obstacleZ = obstacle.z - cycle * this.obstacleLoopLength;
      const farFace = obstacleZ - halfD;
      if (p.z > obstacleZ + halfD + radius) continue;
      if (previousZ > farFace && p.z <= farFace && !this.obstacleHits.has(index)) {
        const sideGap = Math.max(Math.abs(p.x - obstacle.x) - halfW, 0);
        const heightGap = Math.max(Math.abs(p.y - obstacle.y) - halfH, 0);
        const gap = Math.hypot(sideGap, heightGap);
        if (gap > radius && gap < 4.5) {
          s.nearMisses += 1;
          const points = Math.round((s.boosting ? 100 : 50) * s.weatherMultiplier);
          s.score += points;
          this.emit('nearMiss', points);
        }
      }
      if (p.z < farFace - radius) {
        this.obstaclePassed.add(index);
        continue;
      }
      if (this.obstacleHits.has(index) || s.invulnerable > 0) continue;
      const insideX = Math.abs(p.x - obstacle.x) < halfW + radius;
      const insideY = Math.abs(p.y - obstacle.y) < halfH + radius;
      if (!insideX || !insideY) continue;
      this.obstacleHits.add(index);
      p.vx = p.x < obstacle.x ? -10 : 10;
      this.takeHit();
      if (s.status === 'lost') return;
    }
  }

  private updateWeather(dt: number): void {
    const s = this.state;
    const time = s.elapsed;
    let targetWindX = 0;
    let targetWindY = 0;
    if (s.weather === 'rain') {
      targetWindX = Math.sin(time * 0.53 + 0.9) * 2.7;
      targetWindY = Math.sin(time * 0.7) * 0.35;
    } else if (s.weather === 'snow') {
      targetWindX = Math.sin(time * 0.42 + 1.7) * 1.5;
      targetWindY = Math.sin(time * 0.64) * 0.65 - 0.35;
    } else if (s.weather === 'storm') {
      targetWindX = clamp(Math.sin(time * 1.05) * 4.8 + Math.sin(time * 2.9) * 1.7, -6, 6);
      targetWindY = Math.sin(time * 0.8) * 1.5;
    }
    const windResponse = s.weather === 'storm' ? 1.4 : 0.9;
    s.windX = smooth(s.windX, targetWindX, windResponse, dt);
    s.windY = smooth(s.windY, targetWindY, windResponse, dt);
    s.lightningFlash = Math.max(0, s.lightningFlash - dt * 2.4);
    if (s.weather !== 'storm') return;
    if (this.stormStruck && s.lightningFlash === 0) {
      s.stormTarget = null;
      this.stormStruck = false;
      this.stormCooldown = 9 + (this.stormSequence % 3);
    }
    if (s.stormTarget) return;
    this.stormCooldown -= dt;
    if (this.stormCooldown > 0) return;
    // A static, readable zone stays where it was announced; it never tracks evasive motion.
    // Even at full boost there are over 2 seconds to leave its 5.5m radius.
    s.stormTarget = {
      x: clamp(s.player.x, -28, 28),
      y: clamp(s.player.y, 16, 90),
      z: s.player.z - Math.max(105, s.speed * 3.6),
      radius: 5.5,
    };
    s.stormWarning = (s.player.z - s.stormTarget.z) / Math.max(1, s.speed);
    this.stormSequence += 1;
  }

  private checkStorm(previousX: number, previousY: number, previousZ: number): void {
    const s = this.state;
    const target = s.stormTarget;
    if (s.weather !== 'storm' || !target || this.stormStruck) return;
    s.stormWarning = Math.max(0, (s.player.z - target.z) / Math.max(1, s.speed));
    if (s.player.z > target.z) return;
    const fraction = clamp((previousZ - target.z) / Math.max(0.00001, previousZ - s.player.z), 0, 1);
    const crossingX = previousX + (s.player.x - previousX) * fraction;
    const crossingY = previousY + (s.player.y - previousY) * fraction;
    this.stormStruck = true;
    s.lightningFlash = 1;
    s.stormWarning = 0;
    this.events.push({ type: 'lightning', x: target.x, y: target.y, z: target.z });
    if (Math.hypot(crossingX - target.x, crossingY - target.y) < target.radius && s.invulnerable === 0) {
      s.energy = Math.max(0, s.energy - 18);
      this.takeHit();
    }
  }

  private takeHit(): void {
    const s = this.state;
    if (s.invulnerable > 0) return;
    // Free flight keeps feedback from both city and weather collisions without failure.
    if (s.mode === 'journey') s.health -= 1;
    s.combo = 0;
    s.invulnerable = FLIGHT_RULES.invulnerabilitySeconds;
    this.damageSlowdown = 0.6;
    this.emit('hit', s.health);
    if (s.health <= 0) {
      s.status = 'lost';
      s.boosting = false;
      this.emit('lose', s.score);
    }
  }

  private progressTask(id: DeliveryTaskId, amount: number): void {
    const task = this.state.deliveryTask;
    if (task.id !== id || task.completed || amount <= 0) return;
    task.progress = Math.min(task.target, task.progress + amount);
    if (task.progress < task.target) return;
    task.completed = true;
    this.state.tasksCompleted += 1;
    const reward = DELIVERY_TASKS[this.taskIndex]!.reward;
    this.state.score += reward;
    this.state.energy = Math.min(100, this.state.energy + 25);
    this.taskHold = 3;
    this.emit('task', reward);
  }

  private emit(type: FlightEventType, value?: number): void {
    const { x, y, z } = this.state.player;
    this.events.push(value === undefined ? { type, x, y, z } : { type, x, y, z, value });
  }
}
