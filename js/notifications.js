'use strict';

state.alerts = store.get('ql_alerts', []);
state.pushGeneral = store.get('ql_push_general', false);
if (!Array.isArray(state.alerts)) state.alerts = [];

let swReg = null, pushSub = null, pushSyncTimer = null, settingsPrefill = null;

const pushApi = () => QL_CONFIG.proxyUrl ? QL_CONFIG.proxyUrl.replace(/\/+$/, '') + '/push/' : null;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function b64ToBytes(b64){
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function pushCall(path, body){
  const res = await fetch(pushApi() + path, body
    ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

function saveAlertsLocal(){
  store.set('ql_alerts', state.alerts);
  store.set('ql_push_general', state.pushGeneral);
}

function pushSymbols(){
  return [...new Set([...state.watchlist.map(w => w.symbol), ...state.depot.map(p => p.symbol)])];
}

async function pushSave(){
  if (!pushSub) return;
  await pushCall('save', {subscription: pushSub.toJSON(), alerts: state.alerts, general: state.pushGeneral, symbols: pushSymbols()});
}

function schedulePushSync(){
  clearTimeout(pushSyncTimer);
  pushSyncTimer = setTimeout(() => pushSave().catch(() => {}), 1500);
}

async function pullServerState(){
  try {
    const s = await pushCall('state', {endpoint: pushSub.endpoint});
    if (s.known) {
      state.alerts = s.alerts;
      state.pushGeneral = s.general;
      saveAlertsLocal();
    } else {
      await pushSave();
    }
  } catch {}
}

async function initNotifications(){
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register(APP_BASE + 'sw.js', {scope: APP_BASE});
  } catch { return; }
  if (pushSupported() && pushApi()) {
    pushSub = await swReg.pushManager.getSubscription();
    if (pushSub) await pullServerState();
  }
}

async function enablePush(){
  if (!pushApi()) throw new Error('Kein eigener Worker in js/config.js eingetragen.');
  if (!pushSupported()) {
    throw new Error(isIOS && !isStandalone()
      ? 'Auf dem iPhone zuerst über „Teilen → Zum Home-Bildschirm“ installieren und QuantLite von dort öffnen.'
      : 'Dieser Browser unterstützt keine Push-Benachrichtigungen.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt. Du kannst das in den iPhone-Einstellungen unter QuantLite ändern.');
  swReg ||= await navigator.serviceWorker.register(APP_BASE + 'sw.js', {scope: APP_BASE});
  await navigator.serviceWorker.ready;
  const {publicKey} = await pushCall('key');
  pushSub = await swReg.pushManager.getSubscription()
    || await swReg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey)});
  await pushSave();
}

async function disablePush(){
  const sub = pushSub;
  pushSub = null;
  if (!sub) return;
  try { await pushCall('remove', {endpoint: sub.endpoint}); } catch {}
  await sub.unsubscribe().catch(() => {});
}

async function addAlert(input, op, priceText){
  const price = parseNum(priceText);
  if (!input.trim()) throw new Error('Bitte eine Aktie eingeben.');
  if (!(price > 0)) throw new Error('Bitte einen gültigen Preis in € eingeben.');
  const r = await resolveSymbol(input.trim());
  state.alerts.push({id: crypto.randomUUID(), symbol: r.sym, name: displayName(r.sym) !== r.sym ? displayName(r.sym) : r.name, op, price});
  saveAlertsLocal();
  await pushSave();
}

async function removeAlert(id){
  state.alerts = state.alerts.filter(a => a.id !== id);
  saveAlertsLocal();
  await pushSave();
}

function pushStatus(){
  if (!pushApi()) return {text: 'Kein eigener Worker eingetragen – Push nicht möglich.', cls: 'warn'};
  if (!pushSupported()) {
    return isIOS && !isStandalone()
      ? {text: 'Auf dem iPhone funktioniert Push nur, wenn QuantLite über „Teilen → Zum Home-Bildschirm“ installiert und von dort geöffnet wird.', cls: 'warn'}
      : {text: 'Dieser Browser unterstützt keine Push-Benachrichtigungen.', cls: 'warn'};
  }
  if (pushSub && Notification.permission === 'granted') return {text: 'Aktiv auf diesem Gerät. Kurse werden alle 10 Minuten geprüft.', cls: 'ok'};
  if (Notification.permission === 'denied') return {text: 'Benachrichtigungen sind blockiert. Erlaube sie in den Geräte-Einstellungen für QuantLite.', cls: 'warn'};
  return {text: 'Aus. Aktiviere Push, um Kursalarme auf dieses Gerät zu bekommen.', cls: ''};
}

function opLabel(op){ return op === 'above' ? 'über' : 'unter'; }

function renderSettings(){
  const st = pushStatus();
  const on = !!pushSub;
  const pre = settingsPrefill || {};
  $('#settingsBody').innerHTML = `
    <section class="set-section">
      <h4>Benachrichtigungen</h4>
      <p class="set-status ${st.cls}">${esc(st.text)}</p>
      <label class="set-row">
        <span><b>Push-Benachrichtigungen</b><small>Kursalarme und Hinweise aufs Handy</small></span>
        <input type="checkbox" class="switch" id="pushToggle" ${on ? 'checked' : ''}>
      </label>
      <label class="set-row ${on ? '' : 'disabled'}">
        <span><b>Starke Kursbewegungen</b><small>Bei ±${5} % an einem Tag in Watchlist oder Depot</small></span>
        <input type="checkbox" class="switch" id="generalToggle" ${state.pushGeneral ? 'checked' : ''} ${on ? '' : 'disabled'}>
      </label>
      ${on ? '<button class="text-btn" data-push-test>Test-Benachrichtigung senden</button>' : ''}
    </section>

    <section class="set-section">
      <h4>Kursalarme</h4>
      ${state.alerts.length ? `<ul class="alert-list">${state.alerts.map(a => `
        <li><span><b>${esc(a.name)}</b><small>${esc(a.symbol)} · ${opLabel(a.op)} ${fmtEur(a.price)}</small></span>
          <button class="icon-btn" data-alert-del="${esc(a.id)}" aria-label="Alarm löschen">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button></li>`).join('')}</ul>` : '<p class="method">Noch keine Kursalarme.</p>'}
      <form class="alert-form" id="alertForm" autocomplete="off">
        <input id="alertSymbol" placeholder="Aktie, z. B. NVIDIA" value="${esc(pre.symbol || '')}">
        <div class="alert-form-row">
          <select id="alertOp"><option value="above">über</option><option value="below">unter</option></select>
          <input id="alertPrice" inputmode="decimal" placeholder="Preis in €" value="${esc(pre.price || '')}">
          <button class="btn-primary" type="submit">Hinzufügen</button>
        </div>
      </form>
      <p class="method">${on ? 'Alarme lösen einmalig aus und werden danach entfernt.' : 'Alarme werden erst verschickt, wenn Push aktiviert ist.'} Preise in Euro, Fremdwährungen werden umgerechnet.</p>
    </section>`;
}

async function openSettings(prefillSymbol){
  settingsPrefill = null;
  if (prefillSymbol) {
    const q = state.quotes[prefillSymbol];
    let price = '';
    if (q?.ok) {
      try { price = nf(2).format(q.price * await fxToEur(q.currency)).replace(/\./g, ''); } catch {}
    }
    settingsPrefill = {symbol: prefillSymbol, price};
  }
  renderSettings();
  $('#settingsDialog').showModal();
}

document.addEventListener('change', async e => {
  if (e.target.id === 'pushToggle') {
    const box = e.target;
    box.disabled = true;
    try {
      if (box.checked) { await enablePush(); toast('Push-Benachrichtigungen aktiviert', 'ok'); }
      else { await disablePush(); toast('Push-Benachrichtigungen deaktiviert'); }
    } catch (err) {
      toast(err.message, 'err');
    }
    renderSettings();
  }
  if (e.target.id === 'generalToggle') {
    state.pushGeneral = e.target.checked;
    saveAlertsLocal();
    try { await pushSave(); } catch (err) { toast(err.message, 'err'); }
  }
});

document.addEventListener('submit', async e => {
  if (e.target.id !== 'alertForm') return;
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await addAlert($('#alertSymbol').value, $('#alertOp').value, $('#alertPrice').value);
    settingsPrefill = null;
    toast('Kursalarm gespeichert', 'ok');
    renderSettings();
  } catch (err) {
    toast(err.message, 'err');
    btn.disabled = false;
  }
});

document.addEventListener('click', async e => {
  if (e.target.closest('[data-settings-open]')) { openSettings(); return; }
  if (e.target.closest('[data-settings-close]')) { $('#settingsDialog').close(); return; }
  const alarm = e.target.closest('[data-add-alert]');
  if (alarm) { openSettings(alarm.dataset.addAlert); return; }
  const del = e.target.closest('[data-alert-del]');
  if (del) {
    try { await removeAlert(del.dataset.alertDel); } catch (err) { toast(err.message, 'err'); }
    renderSettings();
    return;
  }
  if (e.target.closest('[data-push-test]')) {
    try { await pushCall('test', {endpoint: pushSub.endpoint}); toast('Test-Benachrichtigung verschickt', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  }
});
