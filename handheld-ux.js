import {movementRange, movementPath, attackRange, combatForecast, terrainDefense, stats} from './tactics.js';

// Presentation only. Live eligibility and order submission stay in the AWBW bridge.
export function createHandheldUX({asset, inspect, repaint, message}) {
  const $ = s => document.querySelector(s);
  let view, rangeMode = null, motion = true, movingId = null;
  try { motion = JSON.parse(localStorage.getItem('field-command-settings-v1'))?.motion !== false; } catch {}
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const node = (tag, text, cls) => {const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n;};
  const sprite = unit => {
    const image = node('img'); image.alt = '';
    const file = asset(`${unit.army}${unit.type}.gif`);
    if (file) image.src = file;
    return image;
  };
  const selectedUnit = () => view?.snapshot ? view.snapshot.game?.units.find(u => u.id === view.livePlan?.unitId || u.x === view.cursor.x && u.y === view.cursor.y) : view?.state.units.find(u => u.id === view.selected) || view?.state.units.find(u => u.x === view.cursor.x && u.y === view.cursor.y);
  function health(unit, nextHP = unit.hp) {
    const bar = node('div', undefined, 'hp-track');
    bar.setAttribute('aria-label', `Health ${unit.hp} of 10${nextHP !== unit.hp ? `, projected ${nextHP}` : ''}`);
    for (let i = 0; i < 10; i++) bar.append(node('i', undefined, i < nextHP ? 'hp-full' : i < unit.hp ? 'hp-loss' : ''));
    return bar;
  }
  function card(unit, nextHP, label, damage) {
    const c = node('div', undefined, 'combatant');
    const co=node('img',undefined,'co-head');co.src=asset(unit.army==='os'?'smallandy.png':'smalljess.png')||'';c.append(co,node('span', label, 'eyebrow'), sprite(unit), node('strong', unit.type.toUpperCase()), health(unit, nextHP), node('small', `${unit.hp} → ${nextHP} HP`), node('b', `${damage * 10}%`, 'damage-value'));
    return c;
  }
  function renderForecast() {
    const panel = $('#forecast'); panel.replaceChildren();
    const {state, snapshot, selected, attackTarget, destination, phase} = view;
    const attacker = state.units.find(u => u.id === selected), defender = state.units.find(u => u.id === attackTarget);
    panel.hidden = !!snapshot || phase !== 'forecast' || !attacker || !defender;
    if (panel.hidden) return;
    const f = combatForecast(state, attacker, defender, destination);
    panel.append(node('div', 'BATTLE FORECAST', 'forecast-heading'));
    const fighters = node('div', undefined, 'forecast-fighters');
    fighters.append(card(attacker, f.attackerHP, 'COUNTER', f.counter), node('span', 'VS', 'versus'), card(defender, f.defenderHP, 'DAMAGE', f.damage));
    panel.append(fighters, node('p', `Defender cover ${'★'.repeat(f.cover) || '—'} · Practice estimate. No luck or CO bonuses.`));
  }
  function renderPath() {
    const {state, snapshot, selected, destination, cursor, phase, livePlan} = view;
    const unit = state.units.find(u => u.id === selected);
    const path = snapshot ? (livePlan?.path || []).map(n => ({x: n % snapshot.map.width, y: Math.floor(n / snapshot.map.width)})) : ['move', 'command', 'attack', 'forecast'].includes(phase) ? movementPath(state, unit, destination || cursor) : [];
    for (let i = 0; i < path.length; i++) {
      const point = path[i], cell = $(`#map [data-x="${point.x}"][data-y="${point.y}"]`);
      if (!cell) continue;
      const line = node('span', undefined, 'route-node');
      for (const other of [path[i - 1], path[i + 1]].filter(Boolean)) line.append(node('i', undefined, other.x < point.x ? 'route-left' : other.x > point.x ? 'route-right' : other.y < point.y ? 'route-up' : 'route-down'));
      if (i === path.length - 1) line.classList.add('route-end');
      if (i === 0) line.classList.add('route-start');
      cell.append(line); cell.classList.add('route-tile');
    }
    $('#route-info').textContent = path.length > 1 ? `${path.length - 1} TILE${path.length === 2 ? '' : 'S'} · PREVIEW` : '';
  }
  function renderRange() {
    const unit = selectedUnit(), buttons = [$('#range-move'), $('#range-attack')];
    for (const [i, b] of buttons.entries()) {b.disabled = !unit || !!view.snapshot || !!movingId; b.setAttribute('aria-pressed', String(rangeMode === (i === 0 ? 'move' : 'attack')));}
    $('#unit-info').disabled = !unit;
    if (!rangeMode || view.snapshot || !unit || view.phase !== 'select') return;
    const range = rangeMode === 'move' ? movementRange(view.state, unit) : attackRange(view.state, unit);
    for (const key of range.keys()) {const [x, y] = key.split(','); $(`#map [data-x="${x}"][data-y="${y}"]`)?.classList.add(rangeMode === 'move' ? 'inspect-move' : 'inspect-attack');}
    $('#range-label').textContent = rangeMode === 'move' ? 'MOVEMENT RANGE' : 'THREAT AFTER MOVING';
  }
  function renderMenu() {
    const {state, snapshot} = view, units = snapshot ? snapshot.game?.units || [] : state.units;
    const own = snapshot ? units.filter(u => u.owner === snapshot.game?.viewerPlayerId) : units.filter(u => u.army === state.army);
    const ready = own.filter(u => !u.spent).length;
    const properties = snapshot ? null : state.terrain.filter(t => t.owner === state.army).length;
    $('#menu-summary').textContent = `${ready} READY / ${own.length} UNITS${properties === null ? '' : ` · ${properties} PROPERTIES · ${properties * 1000} G INCOME`}`;
    const roster = $('#unit-roster'); roster.replaceChildren();
    for (const unit of own) {
      const b = node('button', undefined, 'roster-unit');
      if (!snapshot) b.append(sprite(unit));
      const text = node('div'); text.append(node('strong', unit.type?.toUpperCase() || unit.name), node('small', `${unit.hp ?? '—'}/10 HP · ${unit.spent ? 'ACTED' : 'READY'} · ${unit.x + 1}:${unit.y + 1}`));
      b.append(text, node('span', unit.spent ? '✓' : '→')); b.onclick = () => {if (movingId) return; $('#game-menu').close(); rangeMode = null; inspect(unit.x, unit.y);}; roster.append(b);
    }
    if (!own.length) roster.append(node('p', snapshot ? 'No owned visible units in this view.' : 'No units on the field. Deploy at a friendly base.'));
    const log = $('#battle-log'); log.replaceChildren();
    for (const entry of snapshot ? ['Live game history is available in AWBW’s original controls.'] : state.log) log.append(node('li', entry));
  }
  function showInfo() {
    const unit = selectedUnit(); if (!unit) return;
    const body = $('#unit-details-body'); body.replaceChildren();
    const title = unit.type?.toUpperCase() || unit.name;
    $('#unit-details-title').textContent = title;
    if (!view.snapshot) body.append(sprite(unit));
    if (unit.hp != null) body.append(health(unit), node('strong', `${unit.hp}/10 HP`, 'unit-health'));
    const details = view.snapshot ? [['Fuel', unit.fuel ?? '—'], ['Ammo', unit.ammo ?? '—'], ['Orders', unit.spent ? 'Acted' : 'Not marked moved']] : [['Movement', `${stats[unit.type].move} points`], ['Attack', 'Adjacent · direct'], ['Cost', `${stats[unit.type].cost.toLocaleString()} G`], ['Orders', unit.spent ? 'Complete' : 'Ready']];
    const list = node('dl', undefined, 'unit-data'); for (const [label, value] of details) list.append(node('dt', label), node('dd', value)); body.append(list);
    if (!view.snapshot) {const tile = view.state.terrain[unit.y * view.state.width + unit.x]; body.append(node('p', `${tile.type.toUpperCase()} · Cover ${'★'.repeat(terrainDefense[tile.type] || 0) || '—'}`), node('small', 'Practice rules. Live movement and purchases use AWBW’s own rules.'));}
    $('#unit-details').showModal();
  }
  function render(nextView) {
    view = nextView; $('#range-label').textContent = ''; renderPath(); renderRange(); renderForecast(); renderMenu();
    $('#map').classList.toggle('is-moving', !!movingId);
    $('#map').setAttribute('aria-busy', String(!!movingId));
    if (movingId) {for (const cell of document.querySelectorAll('#map .map-cell')) {const u = view.state.units.find(u => u.x === +cell.dataset.x && u.y === +cell.dataset.y); if (u?.id === movingId) for (const image of cell.querySelectorAll('.unit,.health')) image.style.visibility = 'hidden';}}
    if (!view.snapshot) {const tile = view.state.terrain[view.cursor.y * view.state.width + view.cursor.x]; $('#terrain-cover').textContent = '★'.repeat(terrainDefense[tile.type] || 0) || '—'; $('#terrain-cover').title = `${terrainDefense[tile.type] || 0} defense stars`;}
    else if(!new URLSearchParams(location.search).has('game')) $('#terrain-cover').textContent = '';
    $('#lcd-funds').textContent=view.snapshot?(view.snapshot.game?.funds?.toLocaleString()||'—'):view.state.funds[view.state.army].toLocaleString();
    $('#lcd-terrain').textContent=view.snapshot?$('#terrain-name').textContent:view.state.terrain[view.cursor.y*view.state.width+view.cursor.x].type;
    $('#lcd-defense').textContent=$('#terrain-cover').textContent;
  }
  function animate(unit, path, action) {
    if (!motion || reduced.matches || path.length < 2) {if (action === 'attack') impact(); return;}
    movingId = unit.id; repaint();
    const ghost = node('div', undefined, 'moving-unit'); ghost.append(sprite(unit)); $('#map').append(ghost);
    const tile = 16 * view.scale; ghost.style.width = `${tile}px`; ghost.style.height = `${tile}px`;
    const animation = ghost.animate(path.map(p => ({transform: `translate(${p.x * tile}px,${p.y * tile}px)`})), {duration: Math.min(1100, (path.length - 1) * 115), easing: 'linear', fill: 'forwards'});
    animation.finished.catch(() => {}).then(() => {ghost.remove(); movingId = null; repaint(); if (action === 'attack') impact();});
  }
  function impact() {if (!motion || reduced.matches) return; $('#map-scroll').animate([{transform: 'translateX(0)'}, {transform: 'translateX(-3px)'}, {transform: 'translateX(3px)'}, {transform: 'translateX(0)'}], {duration: 170});}
  function turn(army, day) {
    const banner = $('#turn-banner'); banner.textContent = `DAY ${String(day).padStart(2, '0')} · ${army === 'os' ? 'ORANGE STAR' : 'GREEN EARTH'}`;
    banner.hidden = false;
    if (motion && !reduced.matches) banner.animate([{opacity: 0, transform: 'translateX(-14px)'}, {opacity: 1, transform: 'translateX(0)', offset: .2}, {opacity: 1, offset: .8}, {opacity: 0}], {duration: 1500}).finished.catch(() => {}).then(() => {banner.hidden = true;});
    else setTimeout(() => {banner.hidden = true;}, 800);
  }
  $('#unit-info').onclick = showInfo; $('#unit-details-close').onclick = () => $('#unit-details').close();
  for (const [id, mode] of [['#range-move', 'move'], ['#range-attack', 'attack']]) $(id).onclick = () => {rangeMode = rangeMode === mode ? null : mode; repaint(); message(rangeMode === 'attack' ? 'Red tiles show this unit’s potential threat after moving. Practice rules.' : rangeMode === 'move' ? 'Blue tiles show movement through this terrain. Inspecting does not issue an order.' : 'Range overlay cleared.');};
  for (const b of document.querySelectorAll('[data-menu-tab]')) b.onclick = () => {for (const tab of document.querySelectorAll('[data-menu-tab]')) tab.setAttribute('aria-selected', String(tab === b)); for (const panel of document.querySelectorAll('[data-menu-panel]')) panel.hidden = panel.dataset.menuPanel !== b.dataset.menuTab;};
  function motionLabel() {$('#motion').textContent = `Motion: ${motion ? 'on' : 'off'}`;document.body.classList.toggle('reduce-motion',!motion);}
  $('#motion').onclick = () => {motion = !motion; try {localStorage.setItem('field-command-settings-v1', JSON.stringify({motion}));} catch {} motionLabel();}; motionLabel();
  return {render, animate, turn, get busy() {return !!movingId;}, clearRange() {rangeMode = null;}};
}
