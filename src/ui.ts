export type Theme = 'dawn' | 'dusk';
export type WeatherMode = 'clear' | 'rain' | 'snow' | 'storm';
export type FlightMode = 'journey' | 'free';
export type TouchAction = 'left' | 'right' | 'up' | 'down' | 'boost';
export interface UICallbacks {
  onStart(mode: FlightMode): void;
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onTheme(theme: Theme): void;
  onWeather(mode: WeatherMode): void;
  onReducedFlashes?(enabled: boolean): void;
  onSound(enabled: boolean): void;
  onPhoto(): void;
  onQuality(quality: 'high' | 'medium' | 'low'): void;
  onTouch?(action: TouchAction, active: boolean): void;
}
export interface UIState {
  status: 'title' | 'playing' | 'paused' | 'won' | 'lost';
  player?: { x: number; y: number; z: number };
  speed?: number;
  energy?: number;
  health?: number;
  score?: number;
  combo?: number;
  collected?: number;
  ringsCollected?: number;
  target?: number;
  targetRings?: number;
  totalRings?: number;
  elapsed?: number;
  distance?: number;
  routeLength?: number;
  rank?: string;
  mode?: FlightMode;
  heading?: number;
  weather?: WeatherMode;
  windX?: number;
  windY?: number;
  weatherMultiplier?: number;
  stormWarning?: number;
  lightningFlash?: number;
  stormTarget?: { x: number; y: number; z: number; radius: number } | null;
  deliveryTask?: { id: 'rings' | 'boost' | 'perfect'; name: string; progress: number; target: number; completed: boolean };
  tasksCompleted?: number;
  targetPosition?: { x: number; z: number };
}
export interface UIController {
  update(state: UIState): void;
  toast(text: string): void;
  setLoading(progress: number, label?: string): void;
  setReady(): void;
  setTheme(theme: Theme): void;
  setWeather(mode: WeatherMode): void;
  setReducedFlashes(enabled: boolean): void;
  setPhoto(hidden: boolean): void;
  dispose(): void;
}

const swallow = `<svg viewBox="0 0 64 48" fill="none" aria-hidden="true"><path d="M30 27C21 22 10 15 3 4c13 3 22 8 29 15C40 10 50 6 62 4 54 17 44 24 35 28l7 15-10-7-10 7 8-16Z" fill="currentColor"/><path d="m31 19 5-6 5 1-4 4" fill="currentColor"/></svg>`;
const icons: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  rain: '<path d="M6 14a4 4 0 0 1-.2-8A5.5 5.5 0 0 1 16 5a4.5 4.5 0 0 1 2 8.5"/><path d="m8 14-2 4m7-4-2 4m7-4-2 4M9 20l-1 2m8-2-1 2"/>',
  snow: '<path d="M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7m-12-2 3.34 3 3.34-3m-6.68 14 3.34-3 3.34 3M4 11l4.27-1.23-.93-4.27M20 13l-4.27 1.23.93 4.27M4 13l4.27 1.23-.93 4.27M20 11l-4.27-1.23.93-4.27"/>',
  storm: '<path d="M6 13a4 4 0 0 1-.2-8A5.5 5.5 0 0 1 16 4a4.5 4.5 0 0 1 2 8.5"/><path d="m12 10-5 7h5l-1 6 7-9h-5l2-4"/>',
  letter: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3 6 9 7 9-7M3 18l6-6m12 6-6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  moon: '<path d="M19.5 15A8 8 0 0 1 9 4.5 8 8 0 1 0 19.5 15Z"/><path d="M17 3v4m-2-2h4"/>',
  sound: '<path d="m11 5-5 4H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-5 4H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--paper)"/><circle cx="16" cy="17" r="3" fill="var(--paper)"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  feather: '<path d="M6 19C2 8 11 2 21 3c1 10-5 16-13 15M3 22 17 7m-8 9h6m-3-4V8"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',
  photo: '<path d="M4 6h4l2-3h4l2 3h4v15H4V6Z"/><circle cx="12" cy="13" r="4"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v1"/>',
  ring: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity=".35"/>',
  chevron: '<path d="m8 5 7 7-7 7"/>',
  trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-5 1h10"/>',
};
const icon = (name: string, className = ''): string => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
const weatherOptions: { mode: WeatherMode; name: string; icon: string; effect: string; multiplier: number }[] = [
  { mode: 'clear', name: '晴空', icon: 'sun', effect: '平稳飞行', multiplier: 1 },
  { mode: 'rain', name: '细雨', icon: 'rain', effect: '迎着横风', multiplier: 1.25 },
  { mode: 'snow', name: '飞雪', icon: 'snow', effect: '放慢节奏', multiplier: 1.5 },
  { mode: 'storm', name: '雷暴', icon: 'storm', effect: '躲避雷区', multiplier: 2 },
];
const formatTime = (seconds: number): string => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const readPreference = (key: string): string | null => { try { return localStorage.getItem(`sora-${key}`); } catch { return null; } };

export function createUI(callbacks: UICallbacks): UIController {
  const root = document.createElement('div');
  root.id = 'sora-ui';
  root.dataset.status = 'title';
  root.dataset.theme = 'dawn';
  root.innerHTML = `
    <div class="title-wash" aria-hidden="true"></div>
    <header class="topbar">
      <a class="brand" href="#" aria-label="晴空邮便"><span class="brand-bird">${swallow}</span><span class="brand-wordmark">SORA<span>晴空邮便 · SKY POST</span></span></a>
      <div class="top-tools">
        <div class="time-switch" role="group" aria-label="切换时间">
          <button type="button" class="time-button is-selected" data-theme="dawn" aria-label="清晨" aria-pressed="true">${icon('sun')}<span>清晨</span></button>
          <button type="button" class="time-button" data-theme="dusk" aria-label="黄昏" aria-pressed="false">${icon('moon')}<span>黄昏</span></button>
        </div>
        <div class="weather-control">
          <button type="button" class="weather-trigger" aria-label="天气：晴空" aria-haspopup="menu" aria-expanded="false" aria-controls="sora-weather-menu"><span class="weather-trigger-icon">${icon('sun')}</span><span class="weather-trigger-label">晴空</span>${icon('chevron', 'weather-caret')}</button>
          <div class="weather-popover" id="sora-weather-menu" role="menu" aria-label="选择天气" hidden>
            <div class="weather-popover-heading"><span>WEATHER LETTERS</span><strong>今日、空模様</strong></div>
            <div class="weather-options">${weatherOptions.map(option => `<button type="button" class="weather-choice" data-weather-option="${option.mode}" role="menuitemradio" aria-checked="${option.mode === 'clear'}" aria-label="${option.name}，${option.effect}，穿环积分 ${option.multiplier} 倍"><span class="weather-choice-icon">${icon(option.icon)}</span><span class="weather-choice-copy"><strong>${option.name}</strong><small>${option.effect}</small></span><span class="weather-choice-rate">${option.multiplier}×</span></button>`).join('')}</div>
            <p class="weather-footnote">天气加成适用于穿环与掠楼积分。</p>
          </div>
        </div>
        <span class="tool-divider"></span>
        <button type="button" class="icon-button sound-button" aria-label="关闭声音" title="声音">${icon('sound')}</button>
        <button type="button" class="icon-button photo-button play-only" aria-label="摄影模式" title="摄影模式 · F">${icon('photo')}</button>
        <button type="button" class="icon-button settings-button" aria-label="设置" title="设置">${icon('settings')}</button>
        <button type="button" class="icon-button pause-button play-only" aria-label="暂停游戏" title="暂停 · Esc">${icon('pause')}</button>
      </div>
    </header>
    <section class="title-content" aria-label="游戏开始">
      <div class="eyebrow"><span class="eyebrow-line"></span>A LITTLE BIRD. A BIG OPEN SKY.</div>
      <p class="japanese-tag">風にのって、君の街へ。</p>
      <h1>晴空邮便<span class="title-period">。</span></h1>
      <p class="title-english">A LETTER TO THE SKY</p>
      <p class="title-description">把城市留在脚下，把心事交给风。<br>化作一只小鸟，穿过光，飞向下一片晴空。</p>
      <div class="start-actions">
        <button type="button" class="primary-button start-button" disabled><span>开始旅程</span><span class="button-arrow">${icon('arrow')}</span></button>
        <button type="button" class="free-button" disabled>自由飞行<span>${icon('arrow')}</span></button>
      </div>
      <div class="loading-copy"><span class="loading-dot"></span><span class="loading-label">正在唤醒这座城市</span><span class="loading-percent">0%</span></div>
      <div class="loading-track"><span></span></div>
      <div class="ready-note" aria-hidden="true"><span class="tiny-bird">${swallow}</span>一段 2 分钟的空中来信</div>
    </section>
    <aside class="city-caption title-only" aria-label="城市信息"><span class="caption-number">01 / TOKYO BAY</span><span class="caption-line"></span><strong>空のある街</strong><span class="caption-weather"><span class="weather-dot"></span><span class="weather-time">05:42 AM</span> · <span class="caption-weather-name">晴空</span></span><span class="caption-coordinates">35° 39′ N　139° 45′ E</span></aside>
    <footer class="title-footer title-only"><span>THE SKY IS YOURS TO EXPLORE</span><button type="button" class="help-button">${icon('help')} 飞行指南</button><span class="edition">VOL. 01　/　2026</span></footer>
    <section class="flight-hud play-only" aria-label="飞行状态">
      <div class="flight-chapter"><span class="chapter-number">01</span><span><span class="hud-eyebrow">THE MORNING DELIVERY</span><strong class="objective-name">收集风之信笺</strong></span></div>
      <div class="objective-progress"><span class="ring-mark">${icon('ring')}</span><span class="collected-count">00</span><span class="objective-total">/ 18</span><span class="objective-separator"></span><span class="score-value">0</span><span class="score-label">PTS</span></div>
      <div class="journey-track"><span></span></div>
      <div class="journey-caption"><span class="distance-label">启程 · 海岸大道</span><span class="elapsed-label">00:00</span></div>
      <div class="delivery-task" hidden><span class="task-symbol">${icon('letter')}</span><span class="task-name"></span><span class="task-progress"></span></div>
      <div class="combo-badge" aria-live="polite"><span>顺风连击</span><strong>× 1</strong></div>
    </section>
    <div class="compass play-only" aria-hidden="true"><span>W</span><i></i><span>NW</span><i></i><strong>N</strong><i></i><span>NE</span><i></i><span>E</span><b></b></div>
    <section class="flight-instruments play-only" aria-label="速度与体力">
      <div class="speed-readout"><span class="speed-value">0</span><span class="speed-unit">KM/H<span>飞行速度</span></span></div>
      <div class="energy-row">${icon('wind')}<div class="energy-track"><span></span></div><span class="energy-value">100</span></div>
      <div class="wind-readout" hidden><span class="wind-direction">${icon('arrow')}</span><span class="wind-copy"></span><span class="weather-score-rate"></span></div>
      <div class="feather-row"><div class="health-feathers">${icon('feather')}${icon('feather')}${icon('feather')}</div><span class="energy-hint">长按 SPACE 御风加速</span></div>
    </section>
    <aside class="mini-map play-only" aria-label="航线进度">
      <span class="map-north">N</span>
      <svg viewBox="0 0 130 130" aria-hidden="true"><defs><clipPath id="mapClip"><circle cx="65" cy="65" r="54"/></clipPath></defs><circle class="map-background" cx="65" cy="65" r="55"/><g clip-path="url(#mapClip)"><path class="map-water" d="M70 0h60v130H88L70 107l5-21-12-23 13-23Z"/><path class="map-streets" d="M12 30h65M8 53h62M10 78h58m-45 23h54M30 10v103m22-101v116"/><path class="map-route" d="M64 111C46 91 40 77 58 62S67 35 61 18"/><circle class="map-destination" cx="61" cy="18" r="4"/><g class="map-player" transform="translate(64 106)"><circle r="10"/><path d="m0-6 4 11-4-2-4 2Z"/></g></g><circle class="map-border" cx="65" cy="65" r="55"/></svg>
      <span class="map-label">TOKYO BAY<span class="altitude-label">ALT 0 M</span></span>
    </aside>
    <div class="flight-hint play-only"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 飞行</span><span><kbd>SPACE</kbd> 加速</span><span><kbd>F</kbd> 留影</span></div>
    <div class="touch-controls play-only"><div class="touch-dpad"><button data-control="up" aria-label="向上">${icon('chevron')}</button><button data-control="left" aria-label="向左">${icon('chevron')}</button><button data-control="right" aria-label="向右">${icon('chevron')}</button><button data-control="down" aria-label="向下">${icon('chevron')}</button></div><button class="touch-boost" data-control="boost" aria-label="加速">${icon('wind')}<span>加速</span></button></div>
    <div class="storm-warning" hidden><span class="storm-warning-icon">${icon('storm')}</span><span class="storm-warning-copy" role="status" aria-live="polite"></span><span class="storm-countdown" aria-hidden="true"></span></div>
    <div class="toast" role="status" aria-live="polite"><span class="toast-symbol">${icon('feather')}</span><span class="toast-message"></span></div>
    <div class="photo-hint"><span>拖动环绕 · <kbd>C</kbd> 河畔视角</span><button type="button" class="photo-return"><kbd>F</kbd> 返回飞行</button></div>
    <div class="modal-backdrop" hidden>
      <section class="paper-modal" role="dialog" aria-modal="true" aria-label="游戏菜单" tabindex="-1">
        <div class="modal-topline"><span class="modal-eyebrow">SORA / FLIGHT NOTES</span><button type="button" class="icon-button modal-close" aria-label="关闭">${icon('close')}</button></div>
        <div class="modal-content"></div>
        <div class="modal-bottomline"><span>晴空邮便</span><span>WITH LOVE, FROM THE SKY.</span></div>
      </section>
    </div>`;
  document.body.append(root);
  const get = <T extends Element = HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  };
  const listen = (selector: string, callback: () => void): void => { get(selector).addEventListener('click', callback); };
  const modal = get<HTMLElement>('.modal-backdrop');
  const modalContent = get<HTMLElement>('.modal-content');
  let currentState: UIState = { status: 'title' };
  let modalType: 'pause' | 'settings' | 'help' | 'result' | null = null;
  let soundEnabled = readPreference('sound') !== 'false';
  let reducedFlashes = readPreference('reduced-flashes') === 'true';
  const storedWeather = readPreference('weather');
  let selectedWeather: WeatherMode = storedWeather === 'clear' || storedWeather === 'rain' || storedWeather === 'snow' || storedWeather === 'storm' ? storedWeather : 'storm';
  const weatherControl = get<HTMLElement>('.weather-control');
  const weatherTrigger = get<HTMLButtonElement>('.weather-trigger');
  const weatherPopover = get<HTMLElement>('.weather-popover');
  const weatherButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-weather-option]')];
  let photoHidden = false;
  let ready = false;
  let toastTimer = 0;
  let hintTimer = 0;
  let previousStatus = 'title';
  let lastFocus: HTMLElement | null = null;
  const storedQuality = readPreference('quality');
  let selectedQuality: 'high' | 'medium' | 'low' = storedQuality === 'low' || storedQuality === 'medium' ? storedQuality : 'high';
  get('.sound-button').innerHTML = icon(soundEnabled ? 'sound' : 'mute');
  get('.sound-button').setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音');
  const storedBest = Number(readPreference('best') ?? 0);
  if (Number.isFinite(storedBest) && storedBest > 0) get('.edition').textContent = `BEST FLIGHT　${Math.round(storedBest).toLocaleString('en-US')} PTS`;

  const openModal = (type: typeof modalType): void => {
    if (!type) return;
    closeWeather();
    if (modal.hidden) lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalType = type;
    modal.hidden = false;
    get('.paper-modal').setAttribute('aria-label', type === 'settings' ? '游戏设置' : type === 'help' ? '飞行指南' : type === 'result' ? '飞行结果' : '暂停飞行');
    if (type === 'settings') {
      modalContent.innerHTML = `<p class="modal-japanese">自分だけの、空へ。</p><h2>让风如你所愿</h2><p class="modal-description">调整属于你的晴空。</p><div class="settings-row"><span>城市的声音<small>轻柔的风声与原创旋律</small></span><button class="setting-toggle ${soundEnabled ? 'is-on' : ''}" aria-label="切换声音" aria-pressed="${soundEnabled}"><i></i></button></div><div class="settings-row quality-row"><span>画面细节<small>根据设备性能选择</small></span><div class="quality-options"><button data-quality="low">流畅</button><button data-quality="medium">均衡</button><button data-quality="high">精致</button></div></div><div class="settings-row"><span>柔和闪电<small>保留雷光，降低瞬间亮度</small></span><button class="setting-toggle flashes-toggle ${reducedFlashes ? 'is-on' : ''}" aria-label="柔和闪电" aria-pressed="${reducedFlashes}"><i></i></button></div><div class="settings-note">摄影模式 <kbd>F</kbd> · 暂停 <kbd>ESC</kbd><br>清晨与黄昏，可在飞行途中随时切换。</div><button class="primary-button modal-done"><span>回到天空</span>${icon('arrow')}</button>`;
      modalContent.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach(button => {
        button.classList.toggle('is-selected', button.dataset.quality === selectedQuality);
        button.onclick = () => {
          selectedQuality = button.dataset.quality as typeof selectedQuality;
          callbacks.onQuality(selectedQuality);
          modalContent.querySelectorAll('[data-quality]').forEach(el => el.classList.toggle('is-selected', el === button));
        };
      });
      modalContent.querySelector<HTMLButtonElement>('.setting-toggle')!.onclick = () => { toggleSound(); openModal('settings'); };
      modalContent.querySelector<HTMLButtonElement>('.flashes-toggle')!.onclick = () => {
        reducedFlashes = !reducedFlashes;
        callbacks.onReducedFlashes?.(reducedFlashes);
        openModal('settings');
      };
      modalContent.querySelector<HTMLButtonElement>('.modal-done')!.onclick = closeModal;
    } else if (type === 'help') {
      modalContent.innerHTML = `<p class="modal-japanese">飛ぶことは、自由になること。</p><h2>第一次，向天空</h2><p class="modal-description">放轻翅膀，跟随金色的风环。</p><div class="guide-list"><div><span class="guide-number">01</span><p><strong>掌握风的方向</strong><span><kbd>W</kbd> / <kbd>↑</kbd> 爬升　<kbd>S</kbd> / <kbd>↓</kbd> 下降<br><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd> 左右飞行</span></p></div><div><span class="guide-number">02</span><p><strong>收集天空的来信</strong><span>穿过金色风环，连续收集获得额外积分。<br>完成航线，目标收集 18 枚风环，争取更高评级。</span></p></div><div><span class="guide-number">03</span><p><strong>借一阵风，飞得更远</strong><span>长按 <kbd>SPACE</kbd> 加速，松开恢复体力。<br>留意前方楼宇，羽毛代表你的飞行状态。</span></p></div><div><span class="guide-number">04</span><p><strong>给每一场天气，写一封信</strong><span>按 <kbd>T</kbd> 切换天气。雨天横风，雪天缓速。<br>雷暴穿环积分翻倍，按提示向侧方闪避。<br>完成收集、加速、精准穿环任务，获得额外奖励。</span></p></div></div><p class="guide-mobile">触屏设备使用左侧方向键与右侧加速键。</p><button class="primary-button modal-done"><span>我准备好了</span>${icon('arrow')}</button>`;
      modalContent.querySelector<HTMLButtonElement>('.modal-done')!.onclick = closeModal;
    } else if (type === 'pause') {
      modalContent.innerHTML = `<div class="pause-bird">${swallow}</div><p class="modal-japanese">ひと休み。また、飛ぼう。</p><h2>风会等你</h2><p class="modal-description">城市仍在呼吸，天空留了一席给你。</p><button class="primary-button resume-button"><span>继续飞行</span>${icon('arrow')}</button><div class="modal-secondary"><button class="restart-button">${icon('restart')} 重新启程</button><button class="modal-settings">${icon('settings')} 飞行设置</button></div>`;
      modalContent.querySelector<HTMLButtonElement>('.resume-button')!.onclick = closeModal;
      modalContent.querySelector<HTMLButtonElement>('.restart-button')!.onclick = () => { hideModal(); callbacks.onRestart(); };
      modalContent.querySelector<HTMLButtonElement>('.modal-settings')!.onclick = () => openModal('settings');
    } else {
      const won = currentState.status === 'won';
      const rank = currentState.rank || (won ? 'A' : 'C');
      modalContent.innerHTML = `<div class="result-stamp"><span>SKY POST</span><strong>${rank}</strong><small>FLIGHT RANK</small></div><p class="modal-japanese">${won ? 'この空を、忘れない。' : '明日も、空は待っている。'}</p><h2>${won ? '来信，已送达' : '歇一会，再出发'}</h2><p class="modal-description">${won ? '你穿过的风，已成为城市温柔的一部分。' : '每一次尝试，都会让翅膀更熟悉风。'}</p><div class="result-stats"><div><span>飞行积分</span><strong>${Math.round(currentState.score ?? 0).toLocaleString('en-US')}</strong></div><div><span>风之信笺</span><strong>${currentState.ringsCollected ?? currentState.collected ?? 0}<small> / ${currentState.totalRings ?? 30}</small></strong></div><div><span>空中时光</span><strong>${formatTime(currentState.elapsed ?? 0)}</strong></div></div><button class="primary-button restart-button"><span>再寄一封信</span>${icon('arrow')}</button><button class="result-free">继续自由飞行 ${icon('arrow')}</button>`;
      modalContent.querySelector<HTMLButtonElement>('.restart-button')!.onclick = () => { hideModal(); callbacks.onRestart(); };
      modalContent.querySelector<HTMLButtonElement>('.result-free')!.onclick = () => { hideModal(); callbacks.onStart('free'); };
    }
    get<HTMLElement>('.paper-modal').focus({ preventScroll: true });
  };
  function updateWeather(mode: WeatherMode): void {
    selectedWeather = mode;
    root.dataset.weather = mode;
    const option = weatherOptions.find(item => item.mode === mode) ?? weatherOptions[0]!;
    get('.weather-trigger-icon').innerHTML = icon(option.icon);
    get('.weather-trigger-label').textContent = option.name;
    get('.caption-weather-name').textContent = option.name;
    weatherTrigger.setAttribute('aria-label', `天气：${option.name}`);
    weatherButtons.forEach(button => button.setAttribute('aria-checked', String(button.dataset.weatherOption === mode)));
  }
  function closeWeather(restoreFocus = false): void {
    if (weatherPopover.hidden) return;
    weatherPopover.hidden = true;
    weatherTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) weatherTrigger.focus({ preventScroll: true });
  }
  function openWeather(): void {
    weatherPopover.hidden = false;
    weatherTrigger.setAttribute('aria-expanded', 'true');
    const selected = weatherButtons.find(button => button.dataset.weatherOption === selectedWeather);
    selected?.focus({ preventScroll: true });
  }
  const onOutsideWeather = (event: PointerEvent): void => {
    if (event.target instanceof Node && !weatherControl.contains(event.target)) closeWeather();
  };
  const onWeatherKey = (event: KeyboardEvent): void => {
    if (weatherPopover.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeWeather(true); return; }
    if (event.key === 'Tab') { closeWeather(); return; }
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (direction || event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); event.stopPropagation();
      const current = weatherButtons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (Math.max(current, 0) + direction + weatherButtons.length) % weatherButtons.length;
      weatherButtons[next]?.focus({ preventScroll: true });
    }
  };
  document.addEventListener('pointerdown', onOutsideWeather, true);
  document.addEventListener('keydown', onWeatherKey, true);
  weatherTrigger.onclick = () => { if (weatherPopover.hidden) openWeather(); else closeWeather(true); };
  weatherButtons.forEach(button => {
    button.onclick = () => {
      const mode = button.dataset.weatherOption as WeatherMode;
      updateWeather(mode);
      closeWeather(true);
      callbacks.onWeather(mode);
    };
  });
  updateWeather(selectedWeather);
  function hideModal(): void {
    modal.hidden = true;
    modalType = null;
    lastFocus?.focus({ preventScroll: true });
  }
  function closeModal(): void {
    if (currentState.status === 'won' || currentState.status === 'lost') return;
    hideModal();
    if (currentState.status === 'paused') callbacks.onResume();
  }
  function toggleSound(): void {
    soundEnabled = !soundEnabled;
    const button = get<HTMLButtonElement>('.sound-button');
    button.innerHTML = icon(soundEnabled ? 'sound' : 'mute');
    button.setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音');
    callbacks.onSound(soundEnabled);
  }
  function showSettings(type: 'settings' | 'help'): void {
    if (currentState.status === 'playing') callbacks.onPause();
    openModal(type);
  }
  get('.brand').addEventListener('click', event => event.preventDefault());
  listen('.start-button', () => { if (ready) callbacks.onStart('journey'); });
  listen('.free-button', () => { if (ready) callbacks.onStart('free'); });
  listen('.sound-button', toggleSound);
  listen('.settings-button', () => showSettings('settings'));
  listen('.help-button', () => showSettings('help'));
  listen('.pause-button', callbacks.onPause);
  listen('.photo-button', callbacks.onPhoto);
  listen('.photo-return', callbacks.onPhoto);
  listen('.modal-close', closeModal);
  root.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(button => {
    button.onclick = () => callbacks.onTheme(button.dataset.theme as Theme);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
    const action = button.dataset.control as TouchAction;
    const dispatch = (active: boolean): void => {
      button.classList.toggle('is-active', active);
      callbacks.onTouch?.(action, active);
      window.dispatchEvent(new CustomEvent('sora-control', { detail: { action, active } }));
    };
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); dispatch(true); });
    button.addEventListener('pointerup', () => dispatch(false));
    button.addEventListener('pointercancel', () => dispatch(false));
    button.addEventListener('lostpointercapture', () => dispatch(false));
  });
  const onModalKey = (event: KeyboardEvent): void => {
    if (modal.hidden || event.key !== 'Tab') return;
    const buttons = [...modal.querySelectorAll<HTMLElement>('button:not([disabled])')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === get('.paper-modal'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  root.addEventListener('keydown', onModalKey);
  const titleElements = [...root.querySelectorAll<HTMLElement>('.title-content, .city-caption, .title-footer, .brand')];
  const refs = {
    speed: get('.speed-value'), energy: get('.energy-value'), energyBar: get<HTMLElement>('.energy-track span'),
    collected: get('.collected-count'), target: get('.objective-total'), score: get('.score-value'),
    journey: get<HTMLElement>('.journey-track span'), distance: get('.distance-label'), elapsed: get('.elapsed-label'),
    feathers: [...root.querySelectorAll<SVGElement>('.health-feathers .icon')],
    combo: get<HTMLElement>('.combo-badge'), comboValue: get('.combo-badge strong'),
    altitude: get('.altitude-label'), map: get<SVGGElement>('.map-player'), objective: get('.objective-name'),
    chapter: get('.hud-eyebrow'),
    task: get<HTMLElement>('.delivery-task'), taskName: get('.task-name'), taskProgress: get('.task-progress'),
    wind: get<HTMLElement>('.wind-readout'), windDirection: get<HTMLElement>('.wind-direction'), windCopy: get('.wind-copy'), weatherRate: get('.weather-score-rate'),
    storm: get<HTMLElement>('.storm-warning'), stormCopy: get('.storm-warning-copy'), stormCountdown: get('.storm-countdown'),
  };
  return {
    update(state): void {
      currentState = state;
      if (state.weather && state.weather !== selectedWeather) updateWeather(state.weather);
      const status = state.status;
      root.dataset.status = status;
      if (status !== previousStatus) {
        closeWeather();
        titleElements.forEach(element => {
          element.inert = status !== 'title';
          element.setAttribute('aria-hidden', String(status !== 'title'));
        });
        if (status === 'playing') {
          hideModal();
          root.classList.add('show-flight-hint');
          window.clearTimeout(hintTimer);
          hintTimer = window.setTimeout(() => root.classList.remove('show-flight-hint'), 10000);
        } else if (status === 'paused' && modalType !== 'settings' && modalType !== 'help') openModal('pause');
        else if (status === 'won' || status === 'lost') openModal('result');
        else if (status === 'title') hideModal();
        previousStatus = status;
      }
      const energy = clamp(state.energy ?? 100, 0, 100);
      const progress = clamp((state.distance ?? 0) / (state.routeLength ?? 3000), 0, 1);
      refs.speed.textContent = String(Math.round((state.speed ?? 0) * 3.6));
      refs.energy.textContent = String(Math.round(energy));
      refs.energyBar.style.transform = `scaleX(${energy / 100})`;
      refs.energyBar.classList.toggle('is-low', energy < 20);
      refs.collected.textContent = String(state.ringsCollected ?? state.collected ?? 0).padStart(2, '0');
      refs.target.textContent = `/ ${state.targetRings ?? state.target ?? 18}`;
      refs.score.textContent = Math.round(state.score ?? 0).toLocaleString('en-US');
      refs.journey.style.transform = `scaleX(${progress})`;
      refs.elapsed.textContent = formatTime(state.elapsed ?? 0);
      refs.distance.textContent = state.mode === 'free' ? '随风而行 · 自由飞行' : progress < 0.28 ? '启程 · 海岸大道' : progress < 0.6 ? '穿行 · 云间街区' : progress < 0.85 ? '远望 · 城市天际线' : '抵达 · 晴空彼岸';
      refs.objective.textContent = state.mode === 'free' ? '天空，没有终点' : '收集风之信笺';
      refs.chapter.textContent = state.mode === 'free' ? 'FREE FLIGHT / YOUR OWN SKY' : 'A LETTER TO THE SKY';
      refs.feathers.forEach((feather, index) => feather.classList.toggle('is-lost', index >= (state.health ?? 3)));
      refs.combo.classList.toggle('is-visible', (state.combo ?? 0) > 1);
      refs.comboValue.textContent = `× ${state.combo ?? 0}`;
      const task = state.deliveryTask;
      refs.task.hidden = !task;
      if (task) {
        refs.taskName.textContent = task.completed ? '投递完成' : task.name;
        const unit = task.id === 'boost' ? 'm' : '';
        refs.taskProgress.textContent = task.completed ? '+ 奖励已送达' : `${Math.min(task.target, Math.floor(task.progress))}/${task.target}${unit}`;
        refs.task.classList.toggle('is-complete', task.completed);
        refs.task.setAttribute('aria-label', `${task.name}，${Math.floor(task.progress)} / ${task.target}${unit}${task.completed ? '，已完成' : ''}`);
      }
      const wx = state.windX ?? 0, wy = state.windY ?? 0;
      const windSpeed = Math.hypot(wx, wy);
      refs.wind.hidden = selectedWeather === 'clear';
      refs.windDirection.style.transform = `rotate(${Math.atan2(-wy, wx) * 180 / Math.PI}deg)`;
      refs.windCopy.textContent = windSpeed > .15 ? `气流 ${windSpeed.toFixed(1)} M/S` : '微风轻拂';
      refs.weatherRate.textContent = `风环 ×${state.weatherMultiplier ?? weatherOptions.find(item => item.mode === selectedWeather)!.multiplier}`;
      const warning = state.stormWarning ?? 0;
      refs.storm.hidden = status !== 'playing' || warning <= 0;
      if (warning > 0) {
        const direction = state.stormTarget && state.player ? state.player.x <= state.stormTarget.x ? '向左闪避' : '向右闪避' : '飞离雷区';
        const warningCopy = `雷区接近 · ${direction}`;
        if (refs.stormCopy.textContent !== warningCopy) refs.stormCopy.textContent = warningCopy;
        refs.stormCountdown.textContent = `${warning.toFixed(1)}s`;
      }
      refs.altitude.textContent = `ALT ${Math.max(0, Math.round(state.player?.y ?? 0))} M`;
      const mapY = 106 - progress * 86;
      const mapX = 58 + Math.sin(progress * Math.PI * 2) * 10 + clamp(state.player?.x ?? 0, -50, 50) * 0.12;
      refs.map.setAttribute('transform', `translate(${mapX.toFixed(1)} ${mapY.toFixed(1)}) rotate(${state.heading ?? 0})`);
    },
    toast(message): void {
      get('.toast-message').textContent = message;
      root.classList.add('show-toast');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => root.classList.remove('show-toast'), 3000);
    },
    setLoading(progress, label): void {
      const p = clamp(progress > 1 ? progress / 100 : progress, 0, 1);
      get('.loading-percent').textContent = `${Math.round(p * 100)}%`;
      get<HTMLElement>('.loading-track span').style.transform = `scaleX(${p})`;
      if (label) get('.loading-label').textContent = label;
    },
    setReady(): void {
      ready = true;
      root.classList.add('is-ready');
      get<HTMLElement>('.loading-copy').hidden = true;
      get<HTMLElement>('.loading-track').hidden = true;
      get('.ready-note').setAttribute('aria-hidden', 'false');
      get<HTMLButtonElement>('.start-button').disabled = false;
      get<HTMLButtonElement>('.free-button').disabled = false;
    },
    setTheme(theme): void {
      root.dataset.theme = theme;
      document.documentElement.dataset.theme = theme;
      root.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(button => {
        if (!button.matches('button')) return;
        const selected = button.dataset.theme === theme;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      get('.weather-time').textContent = theme === 'dawn' ? '05:42 AM' : '06:18 PM';
    },
    setWeather(mode): void { updateWeather(mode); },
    setReducedFlashes(enabled): void { reducedFlashes = enabled; if (modalType === 'settings') openModal('settings'); },
    setPhoto(hidden): void {
      closeWeather();
      photoHidden = hidden;
      root.classList.toggle('photo-mode', photoHidden);
    },
    dispose(): void {
      window.clearTimeout(toastTimer);
      window.clearTimeout(hintTimer);
      root.removeEventListener('keydown', onModalKey);
      document.removeEventListener('pointerdown', onOutsideWeather, true);
      document.removeEventListener('keydown', onWeatherKey, true);
      root.remove();
    },
  };
}
