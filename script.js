const zoneNames = ['A', 'B', 'C'];
const zoneCards = [...document.querySelectorAll('.zone-card')];
let waterAvailable = true;
let emergencyStopped = false;
let previousSnapshot = null;
const activityEvents = [];
const sessionStats = { requests: 0, activations: 0, rainBlocks: 0, waterInterlocks: 0 };
let lastDemoScenario = null;
let traceStepIndex = 0;
let traceTimer = null;
let identifierClicks = 0;
let startupTimer = null;
let toastTimer = null;

function readZone(card) {
  const soil = card.querySelector('[data-control="soil"].is-selected').dataset.value;
  const rain = card.querySelector('[data-control="rain"].is-selected').dataset.value;
  const dry = soil === 'dry' ? 1 : 0;
  const raining = rain === 'rain' ? 1 : 0;
  const water = waterAvailable ? 1 : 0;

  return { card, name: card.dataset.zone, dry, raining, water };
}

// The request is D AND NOT R AND W. Priority arbitration is applied after this local Boolean result.
function calculateIrrigation(dry, raining, water) {
  return Boolean(dry && !raining && water);
}

function updateZone(zone, request, valveOn) {
  const { card, dry, raining, water } = zone;
  card.querySelector('[data-input="D"]').textContent = dry;
  card.querySelector('[data-input="R"]').textContent = raining;
  card.querySelector('[data-input="W"]').textContent = water;
  card.querySelector('[data-request]').textContent = request ? '1' : '0';
  card.querySelector('[data-valve-text]').textContent = valveOn ? 'VALVE OPEN' : 'VALVE CLOSED';
  card.querySelector('[data-valve-label]').textContent = valveOn ? 'VALVE OPEN' : 'VALVE CLOSED';
  card.querySelector('[data-soil-label]').textContent = dry ? 'DRY' : 'WET';
  card.querySelector('[data-rain-label]').textContent = raining ? 'DETECTED' : 'CLEAR';
  card.querySelector('[data-water-state]').textContent = valveOn ? 'WATERING' : '';
  const stateLabel = card.querySelector('[data-zone-status]');
  let state = 'READY';
  if (emergencyStopped) state = 'STOPPED';
  else if (!water) state = 'BLOCKED / NO WATER';
  else if (raining && dry) state = 'BLOCKED / RAIN';
  else if (valveOn) state = 'IRRIGATING';
  else if (request) state = 'REQUESTING';
  stateLabel.textContent = state;
  card.dataset.state = state.toLowerCase().replaceAll(' ', '-').replaceAll('/', '');
  card.classList.toggle('is-active', valveOn);
  card.setAttribute('aria-label', `Zone ${zone.name}, priority ${zoneNames.indexOf(zone.name) + 1}, irrigation request ${request ? 1 : 0}, valve ${valveOn ? 'on' : 'off'}`);
}

function applyPriority(zones) {
  const eligible = zones.filter((zone) => zone.request);
  const winner = eligible[0] || null;
  const selected = emergencyStopped ? null : winner;
  zones.forEach((zone) => updateZone(zone, zone.request, zone === selected));
  return { eligible, selected };
}

function updateTrace(zone) {
  const notRain = zone.raining ? 0 : 1;
  const result = calculateIrrigation(zone.dry, zone.raining, zone.water);
  document.querySelector('[data-trace="D"]').textContent = zone.dry;
  document.querySelector('[data-trace="R"]').textContent = zone.raining;
  document.querySelector('[data-trace="W"]').textContent = zone.water;
  document.querySelector('#calculation').innerHTML = `${zone.dry} · ${notRain} · ${zone.water} <i>=</i> ${result ? 1 : 0}`;

  const message = document.querySelector('#logic-message');
  message.className = 'logic-message';
  if (emergencyStopped) {
    message.textContent = 'SYSTEM STOPPED / VALVES LOCKED';
    message.classList.add('is-no-water');
  } else if (result) {
    message.textContent = 'IRRIGATION ENABLED';
    message.classList.add('is-enabled');
  } else if (zone.raining) {
    message.textContent = 'RAIN DETECTED / IRRIGATION BLOCKED';
    message.classList.add('is-rain');
  } else if (!zone.water) {
    message.textContent = 'WATER SUPPLY UNAVAILABLE';
    message.classList.add('is-no-water');
  } else {
    message.textContent = 'SOIL IS WET';
  }

  document.querySelectorAll('[data-truth]').forEach((row) => row.classList.remove('current-row'));
  const truthRow = document.querySelector(`[data-truth="${zone.dry}-${zone.raining}-${zone.water}"]`);
  if (truthRow) truthRow.classList.add('current-row');
}

function updateCircuit(zone, selected) {
  const notRain = zone.raining === 0;
  const result = calculateIrrigation(zone.dry, zone.raining, zone.water);
  const setSignal = (id, high, warning = false) => {
    const signal = document.querySelector(id);
    signal.classList.toggle('is-high', high);
    signal.classList.toggle('is-warning', warning);
  };

  setSignal('#signal-d', Boolean(zone.dry));
  setSignal('#node-d', Boolean(zone.dry));
  setSignal('#signal-r-in', Boolean(zone.raining), Boolean(zone.raining));
  setSignal('#node-r', Boolean(zone.raining), Boolean(zone.raining));
  setSignal('#signal-r-out', notRain);
  setSignal('#signal-w', Boolean(zone.water));
  setSignal('#node-w', Boolean(zone.water));
  setSignal('#signal-output', result);
  setSignal('#node-output', Boolean(selected));
  setSignal('#mobile-signal-d', Boolean(zone.dry));
  setSignal('#mobile-r-value', false, Boolean(zone.raining));
  setSignal('#mobile-signal-not-r', notRain);
  setSignal('#mobile-signal-w', Boolean(zone.water));
  setSignal('#mobile-signal-output', result);
  document.querySelector('#and-outline').classList.toggle('is-high', result);
  document.querySelector('#circuit-d-value').textContent = zone.dry ? 'HIGH' : 'LOW';
  document.querySelector('#circuit-r-value').textContent = zone.raining ? 'HIGH' : 'LOW';
  document.querySelector('#circuit-w-value').textContent = zone.water ? 'HIGH' : 'LOW';
  document.querySelector('#circuit-not-r-value').textContent = notRain ? 'HIGH' : 'LOW';
  document.querySelector('#circuit-output-value').textContent = result ? 'HIGH' : 'LOW';
  document.querySelector('#circuit-valve').textContent = selected ? `ZONE ${selected.name} VALVE` : 'NO VALVE SELECTED';
  document.querySelector('#mobile-d-value').textContent = zone.dry ? 'HIGH' : 'LOW';
  document.querySelector('#mobile-r-value').textContent = zone.raining ? 'HIGH' : 'LOW';
  document.querySelector('#mobile-not-r-value').textContent = notRain ? 'HIGH' : 'LOW';
  document.querySelector('#mobile-w-value').textContent = zone.water ? 'HIGH' : 'LOW';
  document.querySelector('#mobile-output-value').textContent = result ? 'HIGH' : 'LOW';
  document.querySelector('#mobile-valve').textContent = selected ? `ZONE ${selected.name} VALVE OPEN` : 'NO VALVE SELECTED';
  document.querySelector('#mobile-valve').classList.toggle('is-active', Boolean(selected));
  document.querySelector('#circuit-d-value').classList.toggle('is-high', Boolean(zone.dry));
  document.querySelector('#circuit-r-value').classList.toggle('is-warning', Boolean(zone.raining));
  document.querySelector('#circuit-w-value').classList.toggle('is-high', Boolean(zone.water));
  document.querySelector('#circuit-not-r-value').classList.toggle('is-high', notRain);
  document.querySelector('#circuit-output-value').classList.toggle('is-high', result);
}

function updatePriority(zones, selected) {
  zones.forEach((zone) => {
    const row = document.querySelector(`[data-priority-zone="${zone.name}"]`);
    row.classList.toggle('is-requesting', zone.request);
    row.classList.toggle('is-selected', zone === selected);
    row.querySelector('.request-state').textContent = zone.request ? 'REQUEST' : 'IDLE';
  });
}

function renderActivity() {
  const log = document.querySelector('#activity-log');
  if (!activityEvents.length) {
    log.innerHTML = '<li class="empty-log">No events recorded this session.</li>';
    return;
  }
  log.innerHTML = activityEvents.map((event) => `<li><time>${event.time}</time><span>${event.message}</span></li>`).join('');
}

function addActivity(message) {
  activityEvents.unshift({
    time: new Date().toLocaleTimeString([], { hour12: false }),
    message
  });
  activityEvents.splice(8);
  renderActivity();
}

function recordActivity(zones, selected) {
  const snapshot = {
    waterAvailable,
    emergencyStopped,
    selected: selected ? selected.name : null,
    zones: zones.map((zone) => ({
      name: zone.name,
      dry: zone.dry,
      raining: zone.raining,
      request: zone.request,
      valveOn: zone === selected
    }))
  };
  if (previousSnapshot) {
    if (snapshot.waterAvailable !== previousSnapshot.waterAvailable) {
      addActivity(`Water supply ${waterAvailable ? 'available' : 'unavailable'}`);
    }
    if (snapshot.emergencyStopped && !previousSnapshot.emergencyStopped) {
      addActivity('Emergency stop engaged. All valves closed.');
    }
    snapshot.zones.forEach((zone, index) => {
      const previous = previousSnapshot.zones[index];
      if (zone.dry !== previous.dry) addActivity(`Zone ${zone.name} soil ${zone.dry ? 'dry' : 'wet'}`);
      if (zone.raining !== previous.raining) addActivity(`Zone ${zone.name} rain ${zone.raining ? 'detected' : 'cleared'}`);
      if (zone.request && !previous.request) {
        sessionStats.requests += 1;
        addActivity(`Zone ${zone.name} request detected`);
      }
      const rainBlocked = zone.dry && zone.raining && waterAvailable;
      const wasRainBlocked = previous.dry && previous.raining && previousSnapshot.waterAvailable;
      if (rainBlocked && !wasRainBlocked) sessionStats.rainBlocks += 1;
      const waterBlocked = zone.dry && !zone.raining && !waterAvailable;
      const wasWaterBlocked = previous.dry && !previous.raining && !previousSnapshot.waterAvailable;
      if (waterBlocked && !wasWaterBlocked) sessionStats.waterInterlocks += 1;
    });
    if (snapshot.selected !== previousSnapshot.selected && snapshot.selected) {
      addActivity(`Zone ${snapshot.selected} approved by priority logic`);
    }
    snapshot.zones.forEach((zone, index) => {
      const previous = previousSnapshot.zones[index];
      if (zone.valveOn !== previous.valveOn) {
        if (zone.valveOn) sessionStats.activations += 1;
        addActivity(`Valve ${zone.name} ${zone.valveOn ? 'OPEN' : 'CLOSED'}`);
        if (zone.valveOn) addActivity(`Zone ${zone.name} watering`);
      }
    });
    if (previousSnapshot.emergencyStopped && !snapshot.emergencyStopped) {
      addActivity('System reset. Automatic control resumed.');
    }
  }
  previousSnapshot = snapshot;
  updateSessionStats();
}

function updateSessionStats() {
  const counters = [
    ['#stat-requests', sessionStats.requests],
    ['#stat-activations', sessionStats.activations],
    ['#stat-rain-blocks', sessionStats.rainBlocks],
    ['#stat-water-interlocks', sessionStats.waterInterlocks]
  ];
  counters.forEach(([selector, value]) => {
    const counter = document.querySelector(selector);
    const nextValue = String(value);
    if (counter.textContent !== nextValue) {
      counter.textContent = nextValue;
      counter.classList.add('value-change');
      setTimeout(() => counter.classList.remove('value-change'), 240);
    }
  });
}

function resetSession() {
  updateSystem();
  Object.keys(sessionStats).forEach((key) => { sessionStats[key] = 0; });
  activityEvents.length = 0;
  renderActivity();
  updateSessionStats();
}

function updateProbe() {
  const selectedName = document.querySelector('#probe-zone').value;
  const zone = readZone(zoneCards.find((card) => card.dataset.zone === selectedName));
  const result = calculateIrrigation(zone.dry, zone.raining, zone.water);
  const notRain = zone.raining ? 0 : 1;
  document.querySelector('#probe-d').textContent = zone.dry;
  document.querySelector('#probe-r').textContent = zone.raining;
  document.querySelector('#probe-w').textContent = zone.water;
  document.querySelector('#probe-not-r').textContent = notRain;
  document.querySelector('#probe-calculation').textContent = `${zone.dry} · ${notRain} · ${zone.water} = ${result ? 1 : 0}`;
  const output = document.querySelector('#probe-output');
  output.textContent = emergencyStopped ? 'LOCKED' : result ? 'HIGH' : 'LOW';
  output.classList.toggle('is-high', result && !emergencyStopped);
  output.classList.toggle('is-locked', emergencyStopped);
}

function updateMap(zones, selected) {
  const mapSection = document.querySelector('#live-map');
  mapSection.classList.toggle('is-unavailable', !waterAvailable);
  document.querySelector('#map-water-label').textContent = waterAvailable ? 'AVAILABLE' : 'UNAVAILABLE';
  document.querySelector('#map-mobile-water').textContent = waterAvailable ? 'AVAILABLE' : 'UNAVAILABLE';
  const mapState = document.querySelector('#map-state');
  mapState.textContent = emergencyStopped ? 'SYSTEM STOPPED' : !waterAvailable ? 'WATER UNAVAILABLE' : selected ? `ZONE ${selected.name} IRRIGATING` : 'SYSTEM READY';
  mapState.classList.toggle('is-stopped', emergencyStopped);
  zones.forEach((zone) => {
    const active = zone === selected;
    const group = document.querySelector(`[data-map-zone="${zone.name}"]`);
    group.classList.toggle('is-active', active);
    group.querySelector('.map-zone-state').textContent = active ? 'ACTIVE' : emergencyStopped ? 'LOCKED' : zone.request ? 'REQUEST / WAIT' : 'IDLE';
    group.querySelector(`[data-map-field="${zone.name}"]`).textContent = `${zone.dry ? 'DRY' : 'WET'} · ${zone.raining ? 'RAIN DETECTED' : 'CLEAR'}`;
    document.querySelector(`[data-map-pipe="${zone.name}"]`).classList.toggle('is-active', active);
    const mobileZone = document.querySelector(`[data-map-mobile-zone="${zone.name}"]`);
    mobileZone.classList.toggle('is-active', active);
    mobileZone.querySelector('.mobile-map-field').textContent = `${zone.dry ? 'DRY' : 'WET'} · ${zone.raining ? 'RAIN' : 'CLEAR'}`;
    mobileZone.querySelector('.mobile-map-valve').textContent = active ? 'VALVE OPEN' : 'VALVE CLOSED';
    mobileZone.querySelector('b').textContent = active ? 'ACTIVE' : emergencyStopped ? 'LOCKED' : zone.request ? 'REQUEST / WAIT' : 'IDLE';
  });
  document.querySelector('.map-pipe.trunk').classList.toggle('is-active', Boolean(selected));
}

function updateHealth(zones) {
  document.body.classList.toggle('system-stopped', emergencyStopped);
  const logicHealth = document.querySelector('#health-logic');
  const waterHealth = document.querySelector('#health-water');
  const priorityHealth = document.querySelector('#health-priority');
  const rainHealth = document.querySelector('#health-rain');
  logicHealth.textContent = emergencyStopped ? 'INTERLOCKED' : 'READY';
  waterHealth.textContent = waterAvailable ? 'AVAILABLE' : 'UNAVAILABLE';
  rainHealth.textContent = zones.some((zone) => zone.raining) ? 'OVERRIDE ACTIVE' : 'READY';
  logicHealth.classList.toggle('is-warning', emergencyStopped);
  logicHealth.classList.toggle('is-stopped', emergencyStopped);
  waterHealth.classList.toggle('is-warning', !waterAvailable);
  waterHealth.classList.toggle('is-blocked', !waterAvailable);
  priorityHealth.classList.toggle('is-warning', emergencyStopped);
  priorityHealth.classList.toggle('is-stopped', emergencyStopped);
  logicHealth.parentElement.classList.toggle('is-warning', emergencyStopped);
  logicHealth.parentElement.classList.toggle('is-stopped', emergencyStopped);
  waterHealth.parentElement.classList.toggle('is-warning', !waterAvailable);
  waterHealth.parentElement.classList.toggle('is-blocked', !waterAvailable);
  priorityHealth.parentElement.classList.toggle('is-warning', emergencyStopped);
  priorityHealth.parentElement.classList.toggle('is-stopped', emergencyStopped);
  rainHealth.classList.toggle('is-warning', zones.some((zone) => zone.raining));
  rainHealth.parentElement.classList.toggle('is-warning', zones.some((zone) => zone.raining));
  zones.forEach((zone) => {
    const inputHealth = document.querySelector(`[data-health-zone="${zone.name}"]`);
    inputHealth.textContent = emergencyStopped ? 'LOCKED' : 'READY';
    inputHealth.classList.toggle('is-warning', emergencyStopped);
    inputHealth.parentElement.classList.toggle('is-warning', emergencyStopped);
  });
  priorityHealth.textContent = emergencyStopped ? 'PAUSED' : 'READY';
  document.querySelector('#system-online-label').textContent = emergencyStopped ? 'SYSTEM STOPPED' : 'SYSTEM ONLINE';
  document.querySelector('#system-indicator').classList.toggle('is-stopped', emergencyStopped);
  document.querySelector('.mode-label').textContent = emergencyStopped ? 'MODE: STOPPED' : 'MODE: AUTOMATIC';
}

function updateDecision(zone, selected, zones) {
  const result = calculateIrrigation(zone.dry, zone.raining, zone.water);
  const winner = zones.find((item) => item.request) || null;
  let title = 'NO IRRIGATION';
  let zoneLabel = 'AWAITING REQUEST';
  let reason = zone.dry ? 'No eligible zone is requesting' : 'Soil is wet';
  if (emergencyStopped) {
    title = 'SYSTEM INTERLOCK';
    zoneLabel = 'ALL VALVES LOCKED';
    reason = 'Emergency stop is latched';
  } else if (!waterAvailable) {
    title = 'SYSTEM INTERLOCK';
    zoneLabel = 'WATER SUPPLY UNAVAILABLE';
    reason = 'Water unavailable';
  } else if (selected) {
    title = 'WATERING';
    zoneLabel = `ZONE ${selected.name} ACTIVE`;
    reason = `Zone ${selected.name} has highest priority`;
  } else if (zone.dry && zone.raining) {
    title = 'IRRIGATION BLOCKED';
    zoneLabel = `ZONE ${zone.name} · RAIN DETECTED`;
    reason = 'Rain detected';
  }

  const priorityZone = selected || winner;
  document.querySelector('#decision-title').textContent = title;
  document.querySelector('#decision-zone').textContent = zoneLabel;
  document.querySelector('#decision-priority').textContent = priorityZone ? `PRIORITY ${String(zoneNames.indexOf(priorityZone.name) + 1).padStart(2, '0')}` : 'PRIORITY —';
  document.querySelector('#decision-d').textContent = zone.dry;
  document.querySelector('#decision-r').textContent = zone.raining;
  document.querySelector('#decision-not-r').textContent = zone.raining ? 0 : 1;
  document.querySelector('#decision-w').textContent = zone.water;
  document.querySelector('#decision-calculation').textContent = `${zone.dry} · ${zone.raining ? 0 : 1} · ${zone.water} = ${result ? 1 : 0}`;
  const output = document.querySelector('#decision-output');
  output.textContent = emergencyStopped ? 'OUTPUT LOCKED' : `OUTPUT ${result ? 'HIGH' : 'LOW'}`;
  output.classList.toggle('is-high', result && !emergencyStopped);
  output.classList.toggle('is-blocked', emergencyStopped || !waterAvailable || (zone.dry && zone.raining));
  document.querySelector('#decision-reason-short').textContent = reason;
  const instrument = document.querySelector('.decision-instrument');
  instrument.classList.toggle('is-active', Boolean(selected));
  instrument.classList.toggle('is-blocked', emergencyStopped || !waterAvailable || (zone.dry && zone.raining));
  const explanation = emergencyStopped
    ? 'Emergency stop is latched. The Boolean request remains visible, but the output interlock keeps every valve closed until RESET SYSTEM.'
    : !waterAvailable
      ? 'W = 0. The master water interlock forces the irrigation output LOW.'
      : zone.raining && zone.dry
        ? `Rain detected. R = 1, so R' = 0. D · R' · W = ${zone.dry} · 0 · ${zone.water} = 0. Irrigation is blocked.`
        : zone.dry
          ? `Zone ${zone.name} is dry and rain is clear. D · R' · W = ${zone.dry} · 1 · ${zone.water} = ${result ? 1 : 0}. ${selected ? `Zone ${selected.name} wins priority.` : 'No valve is selected.'}`
          : `Zone ${zone.name} is wet, therefore D = 0. D · R' · W = 0. Irrigation is disabled.`;
  document.querySelector('#why-explanation').textContent = explanation;
}

function updateViva(zone, selected, zones) {
  const values = [
    `D = ${zone.dry}. Zone ${zone.name} is ${zone.dry ? 'dry' : 'wet'}.`,
    `R = ${zone.raining}. Rain is ${zone.raining ? 'detected' : 'not detected'}.`,
    `R' = ${zone.raining ? 0 : 1}. The rain input is inverted by the NOT gate.`,
    `W = ${zone.water}. Water is ${zone.water ? 'available' : 'unavailable'}.`,
    `D · R' · W = ${zone.dry} · ${zone.raining ? 0 : 1} · ${zone.water} = ${calculateIrrigation(zone.dry, zone.raining, zone.water) ? 1 : 0}.`,
    calculateIrrigation(zone.dry, zone.raining, zone.water) ? 'IRRIGATION REQUEST = HIGH.' : 'IRRIGATION REQUEST = LOW.'
  ];
  document.querySelector('#viva-explanation').innerHTML = values.map((line) => `<li>${line}</li>`).join('');
  const winner = zones.find((item) => item.request);
  document.querySelector('#viva-priority').textContent = emergencyStopped
    ? 'SYSTEM STOPPED. Reset is required to enable any valve.'
    : selected
      ? `ZONE ${selected.name} SELECTED because it has the highest priority.`
      : winner
        ? `ZONE ${winner.name} is the highest-priority request, but its output is interlocked.`
        : 'No zone is selected because no Boolean request is HIGH.';
}

function getTraceSteps(zone, selected, zones) {
  const result = calculateIrrigation(zone.dry, zone.raining, zone.water);
  const winner = zones.find((item) => item.request);
  return [
    { title: 'Read D', detail: `Zone ${zone.name} soil is ${zone.dry ? 'DRY' : 'WET'}: D = ${zone.dry}.`, targets: ['#signal-d', '#circuit-d-value'] },
    { title: "Invert R to R'", detail: `R = ${zone.raining}; NOT output R' = ${zone.raining ? 0 : 1}.`, targets: ['#signal-r-in', '#signal-r-out', '#circuit-not-r-value'] },
    { title: 'Read W', detail: `Water supply is ${zone.water ? 'AVAILABLE' : 'UNAVAILABLE'}: W = ${zone.water}.`, targets: ['#signal-w', '#circuit-w-value'] },
    { title: 'Evaluate AND', detail: `${zone.dry} · ${zone.raining ? 0 : 1} · ${zone.water} = ${result ? 1 : 0}.`, targets: ['#and-outline'] },
    { title: 'Generate request', detail: `Zone ${zone.name} request is ${result ? 'HIGH' : 'LOW'}.`, targets: ['#signal-output', '#circuit-output-value'] },
    { title: 'Apply priority', detail: winner ? `Zone ${winner.name} is the first eligible request in A → B → C order.` : 'No zone is eligible for allocation.', targets: ['[data-priority-zone]'] },
    { title: 'Activate valve', detail: emergencyStopped ? 'Emergency stop holds every valve closed.' : selected ? `Valve ${selected.name} is OPEN.` : 'No valve is activated.', targets: ['.valve-output', '.map-zone.is-active'] }
  ];
}

function renderTraceStep(zone, selected, zones) {
  const steps = getTraceSteps(zone, selected, zones);
  traceStepIndex = ((traceStepIndex % steps.length) + steps.length) % steps.length;
  const step = steps[traceStepIndex];
  document.querySelector('#trace-step-number').textContent = `STEP ${String(traceStepIndex + 1).padStart(2, '0')} / ${steps.length}`;
  document.querySelector('#trace-step-title').textContent = step.title;
  document.querySelector('#trace-step-detail').textContent = step.detail;
  document.querySelectorAll('.trace-focus').forEach((element) => element.classList.remove('trace-focus'));
  if (document.querySelector('#trace-panel').hidden) return;
  step.targets.forEach((selector) => document.querySelectorAll(selector).forEach((element) => element.classList.add('trace-focus')));
}

function updateScenarioReport(zones, selected) {
  if (!lastDemoScenario) {
    const report = document.querySelector('#scenario-report');
    report.classList.remove('is-pass', 'is-fail');
    document.querySelector('#scenario-number').textContent = 'DEMO — / 4';
    document.querySelector('#scenario-status').textContent = 'AWAITING SCENARIO';
    document.querySelector('#scenario-name').textContent = 'No scenario selected';
    document.querySelector('#scenario-input').textContent = '—';
    document.querySelector('#scenario-expected').textContent = '—';
    document.querySelector('#scenario-result').textContent = '—';
    return;
  }
  const config = {
    normal: { number: 1, name: 'NORMAL IRRIGATION', expected: 'ZONE A SELECTED', pass: () => selected?.name === 'A' && waterAvailable },
    rain: { number: 2, name: 'RAIN OVERRIDE', expected: 'NO VALVE / RAIN BLOCKED', pass: () => !selected && zones[0].dry && zones[0].raining && waterAvailable },
    'no-water': { number: 3, name: 'NO WATER', expected: 'ALL VALVES CLOSED', pass: () => !selected && !waterAvailable },
    priority: { number: 4, name: 'PRIORITY TEST', expected: 'ZONE A SELECTED', pass: () => selected?.name === 'A' && zones.every((zone) => zone.request) }
  }[lastDemoScenario];
  const report = document.querySelector('#scenario-report');
  const pass = config.pass();
  report.classList.toggle('is-pass', pass);
  report.classList.toggle('is-fail', !pass);
  document.querySelector('#scenario-number').textContent = `DEMO ${config.number} / 4`;
  document.querySelector('#scenario-name').textContent = config.name;
  document.querySelector('#scenario-input').textContent = `${zones.map((zone) => `${zone.name} ${zone.dry ? 'DRY' : 'WET'}`).join(' · ')} · RAIN ${zones.some((zone) => zone.raining) ? 'DETECTED' : 'CLEAR'} · WATER ${waterAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`;
  document.querySelector('#scenario-expected').textContent = config.expected;
  document.querySelector('#scenario-result').textContent = pass ? 'PASS' : 'FAIL';
  document.querySelector('#scenario-status').textContent = pass ? 'PASS' : 'FAIL';
}

function updateSystem() {
  const zones = zoneCards.map(readZone);
  zones.forEach((zone) => { zone.request = calculateIrrigation(zone.dry, zone.raining, zone.water); });
  const { eligible, selected } = applyPriority(zones);
  updatePriority(zones, selected);
  const waterStatus = document.querySelector('#water-status');
  waterStatus.textContent = waterAvailable ? 'AVAILABLE' : 'UNAVAILABLE';
  waterStatus.closest('.water-status').classList.toggle('is-off', !waterAvailable);
  document.querySelector('#active-zone').textContent = selected ? `ZONE ${selected.name}` : 'NONE';
  document.querySelector('#eligible-count').innerHTML = `${eligible.length} <small>/ 3</small>`;
  document.querySelector('#priority-decision').textContent = emergencyStopped ? 'SYSTEM STOPPED' : selected ? `ZONE ${selected.name} SELECTED` : 'AUTOMATIC / STANDBY';
  document.querySelector('#eligible-zones').textContent = eligible.length ? eligible.map((zone) => zone.name).join(', ') : 'NONE';
  document.querySelector('#selected-zone').textContent = selected ? `ZONE ${selected.name}` : 'NONE';

  const reason = document.querySelector('#decision-reason');
  if (emergencyStopped) {
    reason.textContent = 'Emergency stop is engaged. Reset the system to resume valve control.';
  } else if (!waterAvailable) {
    reason.textContent = 'Water is unavailable, so every valve is forced OFF.';
  } else if (selected) {
    reason.textContent = `Zone ${selected.name} selected because it has the highest priority.`;
  } else {
    reason.textContent = 'No zone is requesting irrigation.';
  }
  const traceZone = selected || zones.find((zone) => zone.request) || zones.find((zone) => zone.name === document.querySelector('#probe-zone').value) || zones[0];
  document.querySelector('#trace-zone').textContent = `ZONE ${traceZone.name} TRACE`;
  updateTrace(traceZone);
  updateCircuit(traceZone, selected);
  document.querySelector('#truth-current-input').textContent = `D ${traceZone.dry} · R ${traceZone.raining} · W ${traceZone.water}`;
  updateDecision(traceZone, selected, zones);
  updateProbe();
  updateMap(zones, selected);
  updateHealth(zones);
  recordActivity(zones, selected);
  updateViva(traceZone, selected, zones);
  updateScenarioReport(zones, selected);
  renderTraceStep(traceZone, selected, zones);
}

function setControl(card, control, value) {
  card.querySelectorAll(`[data-control="${control}"]`).forEach((button) => {
    const selected = button.dataset.value === value;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setWater(available) {
  waterAvailable = available;
  document.querySelectorAll('[data-water]').forEach((button) => {
    const selected = (button.dataset.water === 'available') === available;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function resetSystem() {
  emergencyStopped = false;
  lastDemoScenario = null;
  zoneCards.forEach((card) => {
    setControl(card, 'soil', 'wet');
    setControl(card, 'rain', 'no-rain');
  });
  setWater(true);
  updateSystem();
}

function stopSystem() {
  if (emergencyStopped) return;
  emergencyStopped = true;
  updateSystem();
}

function setTheme(theme, persist = true) {
  document.body.dataset.theme = theme;
  const dark = theme === 'dark';
  const toggle = document.querySelector('#theme-toggle');
  toggle.setAttribute('aria-pressed', String(dark));
  toggle.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
  toggle.querySelector('.theme-label').textContent = dark ? 'LIGHT' : 'DARK';
  toggle.querySelector('[aria-hidden="true"]').textContent = dark ? '☼' : '◐';
  if (persist) {
    try { localStorage.setItem('irrigation-theme', theme); } catch { /* Local-file storage may be disabled by the browser. */ }
  }
}

function togglePresentation() {
  const enabled = document.body.classList.toggle('presentation-mode');
  const button = document.querySelector('#presentation-toggle');
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? 'EXIT PRESENTATION MODE' : 'PRESENTATION MODE';
}

function setView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('.view-button').forEach((button) => {
    const selected = button.dataset.view === view;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function applyTruthRow(row) {
  const [dry, raining, water] = row.dataset.truth.split('-').map(Number);
  const selectedZone = document.querySelector('#probe-zone').value;
  zoneCards.forEach((card) => {
    setControl(card, 'soil', card.dataset.zone === selectedZone && dry ? 'dry' : 'wet');
    setControl(card, 'rain', card.dataset.zone === selectedZone && raining ? 'rain' : 'no-rain');
  });
  document.querySelectorAll('[data-truth]').forEach((item) => item.classList.toggle('truth-chosen', item === row));
  setWater(Boolean(water));
  lastDemoScenario = null;
  updateSystem();
}

function toggleViva(enabled) {
  document.querySelector('#viva-panel').hidden = !enabled;
  document.querySelector('#viva-toggle').setAttribute('aria-expanded', String(enabled));
  document.body.classList.toggle('viva-active', enabled);
  if (enabled) document.querySelector('#viva-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function toggleTrace(enabled) {
  const panel = document.querySelector('#trace-panel');
  panel.hidden = !enabled;
  document.querySelector('#trace-toggle').setAttribute('aria-expanded', String(enabled));
  if (!enabled) document.querySelectorAll('.trace-focus').forEach((element) => element.classList.remove('trace-focus'));
}

function toggleAutoTrace() {
  const button = document.querySelector('#trace-auto');
  if (traceTimer) {
    clearInterval(traceTimer);
    traceTimer = null;
  } else {
    toggleTrace(true);
    traceTimer = setInterval(() => {
      traceStepIndex += 1;
      refreshTraceStep();
    }, 1600);
  }
  button.setAttribute('aria-pressed', String(Boolean(traceTimer)));
  button.textContent = traceTimer ? 'STOP AUTO' : 'AUTO TRACE';
}

function refreshTraceStep() {
  const zones = zoneCards.map(readZone);
  zones.forEach((zone) => { zone.request = calculateIrrigation(zone.dry, zone.raining, zone.water); });
  const { selected } = applyPriority(zones);
  const zone = selected || zones.find((item) => item.request) || zones.find((item) => item.name === document.querySelector('#probe-zone').value) || zones[0];
  renderTraceStep(zone, selected, zones);
}

function finishStartup() {
  if (startupTimer) clearTimeout(startupTimer);
  startupTimer = null;
  const screen = document.querySelector('#startup-sequence');
  screen.classList.add('is-dismissing');
  setTimeout(() => {
    screen.hidden = true;
    screen.classList.remove('is-dismissing');
  }, 180);
}

function startStartup() {
  const screen = document.querySelector('#startup-sequence');
  let seen = false;
  try {
    seen = sessionStorage.getItem('sirc-startup-seen') === 'true';
    sessionStorage.setItem('sirc-startup-seen', 'true');
  } catch {
    seen = false;
  }
  if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  screen.hidden = false;
  startupTimer = setTimeout(finishStartup, 1450);
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function countIdentifierClick() {
  identifierClicks += 1;
  if (identifierClicks >= 5) {
    identifierClicks = 0;
    showToast('Built for Digital Logic Design');
  }
}

function runDemo(scenario) {
  if (emergencyStopped) return;
  lastDemoScenario = scenario;
  zoneCards.forEach((card) => {
    setControl(card, 'soil', 'wet');
    setControl(card, 'rain', 'no-rain');
  });
  setWater(true);
  const zoneA = zoneCards[0];
  if (scenario === 'normal') {
    setControl(zoneA, 'soil', 'dry');
  } else if (scenario === 'rain') {
    setControl(zoneA, 'soil', 'dry');
    setControl(zoneA, 'rain', 'rain');
  } else if (scenario === 'no-water') {
    setControl(zoneA, 'soil', 'dry');
    setWater(false);
  } else if (scenario === 'priority') {
    zoneCards.forEach((card) => setControl(card, 'soil', 'dry'));
  }
  updateSystem();
}

document.addEventListener('click', (event) => {
  const truthRow = event.target.closest('[data-truth]');
  if (truthRow) {
    applyTruthRow(truthRow);
    return;
  }

  const controlButton = event.target.closest('[data-control]');
  if (controlButton) {
    setControl(controlButton.closest('.zone-card'), controlButton.dataset.control, controlButton.dataset.value);
    updateSystem();
    return;
  }

  const waterButton = event.target.closest('[data-water]');
  if (waterButton) {
    setWater(waterButton.dataset.water === 'available');
    updateSystem();
    return;
  }

  const demoButton = event.target.closest('[data-demo]');
  if (demoButton) {
    runDemo(demoButton.dataset.demo);
    return;
  }

  if (event.target.closest('#reset-button')) resetSystem();
  if (event.target.closest('#emergency-stop')) stopSystem();
  if (event.target.closest('#clear-log')) {
    activityEvents.length = 0;
    renderActivity();
  }
  if (event.target.closest('#theme-toggle')) {
    setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  }
  if (event.target.closest('#presentation-toggle')) togglePresentation();
  if (event.target.closest('#why-button')) {
    const button = document.querySelector('#why-button');
    const explanation = document.querySelector('#why-explanation');
    explanation.hidden = !explanation.hidden;
    button.setAttribute('aria-expanded', String(!explanation.hidden));
  }
  if (event.target.closest('#viva-toggle')) toggleViva(true);
  if (event.target.closest('#viva-exit')) toggleViva(false);
  if (event.target.closest('#trace-toggle')) toggleTrace(document.querySelector('#trace-panel').hidden);
  if (event.target.closest('#trace-next')) {
    traceStepIndex += 1;
    refreshTraceStep();
  }
  if (event.target.closest('#trace-auto')) toggleAutoTrace();
  if (event.target.closest('#reset-session')) resetSession();
  const viewButton = event.target.closest('.view-button');
  if (viewButton) setView(viewButton.dataset.view);
  if (event.target.closest('#skip-startup')) finishStartup();
  if (event.target.closest('#sirc-identifier, #plate-identifier')) {
    event.preventDefault();
    countIdentifierClick();
  }
});

document.querySelector('#probe-zone').addEventListener('change', updateSystem);
document.querySelectorAll('[data-truth]').forEach((row) => {
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      applyTruthRow(row);
    }
  });
});
document.querySelectorAll('.section-nav a').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      event.preventDefault();
      if (link.getAttribute('href') === '#logic' || link.getAttribute('href') === '#truth') setView('logic');
      else if (['#control', '#live-map', '#priority', '#demo'].includes(link.getAttribute('href'))) setView('control');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

try {
  setTheme(localStorage.getItem('irrigation-theme') === 'light' ? 'light' : 'dark', false);
} catch {
  setTheme('dark', false);
}
updateSystem();
setView('control');
startStartup();