/**
 * FinanceOS 2026 — Personal Finance Manager
 * Vanilla JS · localStorage · Chart.js · Premium Animations
 */

'use strict';

// ═══════════════════════════════════════════════
// CONSTANTS & DEFAULTS
// ═══════════════════════════════════════════════

const DEFAULT_CONFIG = {
  pct_gastos:     60,
  pct_ahorro_usd: 20,
  pct_ahorro_cop: 10,
  pct_inversion:  10,
  tasa_cop:       4000,
};

let DEFAULT_RECURRING = [
  { id: 'r1', nombre: 'Gasolina',     monto: 0, frecuencia: 'semanal',   categoria: 'Transporte' },
  { id: 'r2', nombre: 'Comida',       monto: 0, frecuencia: 'semanal',   categoria: 'Alimentación' },
  { id: 'r3', nombre: 'Arriendo',     monto: 0, frecuencia: 'mensual',   categoria: 'Vivienda' },
  { id: 'r4', nombre: 'Gimnasio',     monto: 0, frecuencia: 'mensual',   categoria: 'Gimnasio' },
  { id: 'r5', nombre: 'Luz',          monto: 0, frecuencia: 'mensual',   categoria: 'Vivienda' },
  { id: 'r6', nombre: 'Plan celular', monto: 0, frecuencia: 'mensual',   categoria: 'Otros' },
  { id: 'r7', nombre: 'Seguro carro', monto: 0, frecuencia: 'mensual',   categoria: 'Seguros' },
  { id: 'r8', nombre: 'Ayuda padre',  monto: 0, frecuencia: 'quincenal', categoria: 'Familia' },
];

const CATEGORY_COLORS = {
  'Vivienda':     '#4F46E5',
  'Alimentación': '#F59E0B',
  'Transporte':   '#10B981',
  'Gimnasio':     '#EF4444',
  'Seguros':      '#8B5CF6',
  'Ahorro COP':   '#06B6D4',
  'Ahorro USD':   '#34D399',
  'Familia':      '#F97316',
  'Inversiones':  '#06B6D4',
  'Otros':        '#94A3B8',
};

const CATEGORY_EMOJIS = {
  'Vivienda':'🏠','Alimentación':'🍔','Transporte':'🚗',
  'Gimnasio':'💪','Seguros':'🛡️','Familia':'👨‍👩‍👧',
  'Ahorro COP':'💰','Ahorro USD':'💵','Inversiones':'📈','Otros':'📦'
};

function categorySlug(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
}

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════

let state = {
  ingresos:   [],
  gastos:     [],
  config:     { ...DEFAULT_CONFIG },
  recurring:  [...DEFAULT_RECURRING],
  ahorro_usd: 0,
  ahorro_cop: 0,
  inversion:  0,
};

function sanitizeRecurringAmounts(recurring) {
  if (!Array.isArray(recurring)) return recurring;
  return recurring.map(item => {
    if (!item || typeof item !== 'object') return item;
    return { ...item, monto: 0 };
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem('financeOS_v1');
    if (raw) {
      const saved = JSON.parse(raw);
      const recurring = sanitizeRecurringAmounts(saved.recurring || [...DEFAULT_RECURRING]);
      const config = { ...DEFAULT_CONFIG, ...(saved.config || {}) };
      config.pct_ahorro_cop = config.pct_inversion;
      state = {
        ingresos:   saved.ingresos   || [],
        gastos:     saved.gastos     || [],
        config,
        recurring,
        ahorro_usd: saved.ahorro_usd || 0,
        ahorro_cop: saved.ahorro_cop || 0,
        inversion:  saved.inversion  || 0,
      };
      recalcSavingsBuckets();
      if (JSON.stringify(recurring) !== JSON.stringify(saved.recurring || [])) {
        saveState();
      }
    }
  } catch(e) { console.warn('Error loading state', e); }
}

function saveState() {
  try {
    localStorage.setItem('financeOS_v1', JSON.stringify(state));
  } catch(e) { console.warn('Error saving state', e); }
}

function recalcSavingsBuckets() {
  const totals = state.ingresos.reduce((acc, ingreso) => {
    const dist = calcDistribution(ingreso.monto);
    acc.ahorro_usd += dist.ahorro_usd;
    acc.ahorro_cop += dist.ahorro_cop;
    acc.inversion  += dist.inversion;
    return acc;
  }, { ahorro_usd: 0, ahorro_cop: 0, inversion: 0 });

  state.ahorro_usd = totals.ahorro_usd;
  state.ahorro_cop = totals.ahorro_cop;
  state.inversion  = totals.inversion;

  state.gastos.forEach(gasto => {
    if (gasto.categoria === 'Inversiones') state.inversion = Math.max(0, state.inversion - gasto.monto);
    if (gasto.categoria === 'Ahorro COP')  state.ahorro_cop = Math.max(0, state.ahorro_cop - gasto.monto);
    if (gasto.categoria === 'Ahorro USD')  state.ahorro_usd = Math.max(0, state.ahorro_usd - gasto.monto);
  });
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

const fmtUSD = (v) => {
  const n = parseFloat(v) || 0;
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtCOP = (v) => {
  const n = parseFloat(v) || 0;
  return '$' + Math.round(n).toLocaleString('es-CO') + ' COP';
};

function todayStr() { return new Date().toISOString().slice(0,10); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(now.setDate(diff));
  mon.setHours(0,0,0,0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23,59,59,999);
  return { start: mon, end: sun };
}

function getMonthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);
  return { start, end };
}

function inRange(dateStr, range) {
  const d = new Date(dateStr + 'T12:00:00');
  return d >= range.start && d <= range.end;
}

function monthKey(dateStr) { return dateStr.slice(0, 7); }

function parseDate(dateStr) { return new Date(dateStr + 'T12:00:00'); }

function monthlyRecurringCost() {
  return state.recurring.reduce((acc, r) => {
    const m = r.monto || 0;
    if (r.frecuencia === 'mensual')   return acc + m;
    if (r.frecuencia === 'semanal')   return acc + (m * 4.33);
    if (r.frecuencia === 'quincenal') return acc + (m * 2);
    return acc + m;
  }, 0);
}

function weeklyRecurringCost() {
  return state.recurring.reduce((acc, r) => {
    const m = r.monto || 0;
    if (r.frecuencia === 'semanal')   return acc + m;
    if (r.frecuencia === 'mensual')   return acc + (m / 4.33);
    if (r.frecuencia === 'quincenal') return acc + (m / 2);
    return acc + m;
  }, 0);
}

// ═══════════════════════════════════════════════
// FINANCIAL CALCULATIONS
// ═══════════════════════════════════════════════

function calcDistribution(amount) {
  const c = state.config;
  const total = c.pct_gastos + c.pct_ahorro_usd + c.pct_ahorro_cop + c.pct_inversion;
  const safe = total > 0 ? total : 100;
  return {
    gastos:     (amount * c.pct_gastos     / safe),
    ahorro_usd: (amount * c.pct_ahorro_usd / safe),
    ahorro_cop: (amount * c.pct_ahorro_cop / safe),
    inversion:  (amount * c.pct_inversion  / safe),
  };
}

function calcTotals() {
  const week   = getWeekRange();
  const month  = getMonthRange();

  const ingWeek  = state.ingresos.filter(i => inRange(i.fecha, week)).reduce((a,i) => a + i.monto, 0);
  const ingMonth = state.ingresos.filter(i => inRange(i.fecha, month)).reduce((a,i) => a + i.monto, 0);
  const gasWeek  = state.gastos.filter(g => inRange(g.fecha, week)).reduce((a,g) => a + g.monto, 0);
  const gasMonth = state.gastos.filter(g => inRange(g.fecha, month)).reduce((a,g) => a + g.monto, 0);

  const monthlyRec = monthlyRecurringCost();
  const weeklyRec  = weeklyRecurringCost();
  const ingTotal   = state.ingresos.reduce((a,i) => a + i.monto, 0);
  const gasTotal   = state.gastos.reduce((a,g) => a + g.monto, 0);
  const ahorroUSD  = state.ahorro_usd;
  const ahorroCOP  = state.ahorro_cop;
  const inversion  = state.inversion;
  const disponible = ingMonth - gasMonth - monthlyRec;

  return {
    ingWeek, ingMonth,
    gasWeek: gasWeek + weeklyRec,
    gasMonth: gasMonth + monthlyRec,
    ahorroUSD, ahorroCOP, inversion,
    disponible, ingTotal, gasTotal,
    monthlyRec, weeklyRec,
  };
}

function gastosPorCategoria(monthOffset = 0) {
  const range = getMonthRange(monthOffset);
  const map = {};
  state.gastos.filter(g => inRange(g.fecha, range)).forEach(g => {
    map[g.categoria] = (map[g.categoria] || 0) + g.monto;
  });
  state.recurring.forEach(r => {
    const amount = r.frecuencia === 'semanal'   ? r.monto * 4.33
                 : r.frecuencia === 'quincenal' ? r.monto * 2
                 : r.monto;
    map[r.categoria] = (map[r.categoria] || 0) + amount;
  });
  return map;
}

function ingresosPorMes(n = 6) {
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const range = getMonthRange(-i);
    const total = state.ingresos.filter(ing => inRange(ing.fecha, range)).reduce((a,x) => a + x.monto, 0);
    const label = range.start.toLocaleString('es', { month: 'short', year: '2-digit' });
    months.push({ label, total });
  }
  return months;
}

function ahorroPorMes(n = 6) {
  const months = [];
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) {
    const range = getMonthRange(-i);
    const ingMonth = state.ingresos.filter(x => inRange(x.fecha, range)).reduce((a,x) => a + x.monto, 0);
    const dist = calcDistribution(ingMonth);
    acc += dist.ahorro_usd;
    const label = range.start.toLocaleString('es', { month: 'short', year: '2-digit' });
    months.push({ label, total: acc });
  }
  return months;
}

function patrimonioNeto(n = 6) {
  const months = [];
  let patrimonio = 0;
  for (let i = n - 1; i >= 0; i--) {
    const range = getMonthRange(-i);
    const ingM = state.ingresos.filter(x => inRange(x.fecha, range)).reduce((a,x) => a + x.monto, 0);
    const gasM = state.gastos.filter(x => inRange(x.fecha, range)).reduce((a,x) => a + x.monto, 0);
    patrimonio += ingM - gasM - monthlyRecurringCost();
    const label = range.start.toLocaleString('es', { month: 'short', year: '2-digit' });
    months.push({ label, total: patrimonio });
  }
  return months;
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════

function renderDashboard() {
  const t = calcTotals();

  animateValue('card-ingresos-semana', t.ingWeek);
  animateValue('card-ingresos-mes',    t.ingMonth);
  animateValue('card-gastos-semana',   t.gasWeek);
  animateValue('card-gastos-mes',      t.gasMonth);
  animateValue('card-ahorro-usd',      t.ahorroUSD);
  animateValue('card-ahorro-cop',      t.ahorroCOP);
  animateValue('card-inversion',       t.inversion);

  const dispEl = document.getElementById('card-disponible');
  if (dispEl) {
    dispEl.textContent = fmtUSD(t.disponible);
    dispEl.style.color = t.disponible < 0 ? 'var(--accent-red)' : 'var(--accent-blue)';
  }

  // Also update a larger featured disponible element if present
  const featuredEl = document.getElementById('featured-disponible');
  if (featuredEl) {
    featuredEl.textContent = fmtUSD(t.disponible);
    featuredEl.style.color = t.disponible < 0 ? 'var(--accent-red)' : 'var(--accent-blue)';
  }

  // Distribution bar
  const c = state.config;
  const total = c.pct_gastos + c.pct_ahorro_usd + c.pct_ahorro_cop + c.pct_inversion || 100;
  const distGastos    = document.getElementById('dist-gastos');
  const distAhorroUsd = document.getElementById('dist-ahorro-usd');
  const distAhorroCop = document.getElementById('dist-ahorro-cop');
  const distInversion = document.getElementById('dist-inversion');

  if (distGastos)    { distGastos.style.width    = (c.pct_gastos     / total * 100) + '%'; distGastos.querySelector('span').textContent    = `Gastos ${c.pct_gastos}%`; }
  if (distAhorroUsd) { distAhorroUsd.style.width = (c.pct_ahorro_usd / total * 100) + '%'; distAhorroUsd.querySelector('span').textContent = `USD ${c.pct_ahorro_usd}%`; }
  if (distAhorroCop) { distAhorroCop.style.width = (c.pct_ahorro_cop / total * 100) + '%'; distAhorroCop.querySelector('span').textContent = `COP ${c.pct_ahorro_cop}%`; }
  if (distInversion) { distInversion.style.width = (c.pct_inversion  / total * 100) + '%'; distInversion.querySelector('span').textContent = `Inv ${c.pct_inversion}%`; }

  // Recurring expenses
  const grid = document.getElementById('recurringGrid');
  if (grid) {
    grid.innerHTML = state.recurring.map(r => `
      <div class="recurring-item">
        <div class="recurring-item-name">${CATEGORY_EMOJIS[r.categoria] || '📦'} ${r.nombre}</div>
        <div class="recurring-item-amount">${fmtUSD(r.monto)}</div>
        <div class="recurring-item-freq">${r.frecuencia}</div>
      </div>
    `).join('');
  }

  renderChartBalance();
}

// Animated number counter
function animateValue(id, targetVal) {
  const el = document.getElementById(id);
  if (!el) return;
  const formatted = fmtUSD(targetVal);
  el.textContent = formatted;
  el.style.transition = 'color 0.3s ease';
}

// ═══════════════════════════════════════════════
// INCOMES PAGE
// ═══════════════════════════════════════════════

function renderIngresosPage() {
  renderIngresosTable(state.ingresos.slice().reverse().slice(0, 10), 'tbodyIngresosRecent');
}

function renderIngresosTable(data, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-text">Sin registros aún</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(i => `
    <tr>
      <td class="fw-mono" style="white-space:nowrap">${formatDisplayDate(i.fecha)}</td>
      <td>${escHtml(i.descripcion)}</td>
      <td class="amount-positive">${fmtUSD(i.monto)}</td>
      <td>
        <div class="tbl-actions">
          <button class="tbl-btn edit" onclick="editIngreso('${i.id}')">Editar</button>
          <button class="tbl-btn del"  onclick="deleteIngreso('${i.id}')">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function addIngreso() {
  const fecha = document.getElementById('ingreso-fecha').value;
  const desc  = document.getElementById('ingreso-descripcion').value.trim();
  const monto = parseFloat(document.getElementById('ingreso-monto').value);

  if (!fecha)               return toast('Selecciona una fecha', 'error');
  if (!desc)                return toast('Agrega una descripción', 'error');
  if (!monto || monto <= 0) return toast('Monto inválido', 'error');

  const dist = calcDistribution(monto);
  const ingreso = { id: uid(), fecha, descripcion: desc, monto };
  state.ingresos.push(ingreso);

  state.ahorro_usd += dist.ahorro_usd;
  state.ahorro_cop += dist.ahorro_cop;
  state.inversion  += dist.inversion;

  saveState();
  toast(`Ingreso ${fmtUSD(monto)} registrado ✓`, 'success');

  document.getElementById('ingreso-fecha').value = todayStr();
  document.getElementById('ingreso-descripcion').value = '';
  document.getElementById('ingreso-monto').value = '';
  document.getElementById('ingreso-preview-breakdown').style.display = 'none';
  document.getElementById('ingreso-preview-text').style.display = 'block';

  renderIngresosPage();
  renderDashboard();
}

// Open modal to add ingreso (from featured card)
function openIngresoModal() {
  const body = `
    <div class="form-group">
      <label class="form-label">Fecha</label>
      <input type="date" class="form-input" id="modal-ingreso-fecha" />
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <input type="text" class="form-input" id="modal-ingreso-descripcion" placeholder="Ej: Salario" />
    </div>
    <div class="form-group">
      <label class="form-label">Monto (USD)</label>
      <div class="input-prefix-wrap">
        <span class="input-prefix">$</span>
        <input type="number" class="form-input input-with-prefix" id="modal-ingreso-monto" placeholder="0.00" step="0.01" min="0" />
      </div>
    </div>
  `;
  openModal('Nuevo Ingreso', body, () => addIngresoFromModal());
  const el = document.getElementById('modal-ingreso-fecha'); if (el) el.value = todayStr();
}

function addIngresoFromModal() {
  const fecha = document.getElementById('modal-ingreso-fecha').value;
  const desc  = document.getElementById('modal-ingreso-descripcion').value.trim();
  const monto = parseFloat(document.getElementById('modal-ingreso-monto').value);
  if (!fecha)               return toast('Selecciona una fecha', 'error');
  if (!desc)                return toast('Agrega una descripción', 'error');
  if (!monto || monto <= 0) return toast('Monto inválido', 'error');

  const dist = calcDistribution(monto);
  const ingreso = { id: uid(), fecha, descripcion: desc, monto };
  state.ingresos.push(ingreso);
  state.ahorro_usd += dist.ahorro_usd;
  state.ahorro_cop += dist.ahorro_cop;
  state.inversion  += dist.inversion;
  saveState(); toast(`Ingreso ${fmtUSD(monto)} registrado ✓`, 'success');
  closeModal(); renderAll();
}

function editIngreso(id) {
  const item = state.ingresos.find(x => x.id === id);
  if (!item) return;
  openModal('Editar Ingreso', `
    <div class="form-group"><label class="form-label">Fecha</label>
      <input type="date" class="form-input" id="m-fecha" value="${item.fecha}" /></div>
    <div class="form-group"><label class="form-label">Descripción</label>
      <input type="text" class="form-input" id="m-desc" value="${escHtml(item.descripcion)}" /></div>
    <div class="form-group"><label class="form-label">Monto (USD)</label>
      <input type="number" class="form-input" id="m-monto" value="${item.monto}" step="0.01" /></div>
  `, () => {
    const fecha = document.getElementById('m-fecha').value;
    const desc  = document.getElementById('m-desc').value.trim();
    const monto = parseFloat(document.getElementById('m-monto').value);
    if (!fecha || !desc || !monto) return toast('Completa todos los campos', 'error');

    const diff = monto - item.monto;
    const distDiff = calcDistribution(diff);
    state.ahorro_usd += distDiff.ahorro_usd;
    state.ahorro_cop += distDiff.ahorro_cop;
    state.inversion  += distDiff.inversion;

    item.fecha = fecha; item.descripcion = desc; item.monto = monto;
    saveState(); closeModal(); toast('Ingreso actualizado ✓', 'success');
    renderAll();
  });
}

function deleteIngreso(id) {
  const item = state.ingresos.find(x => x.id === id);
  if (!item) return;
  if (!confirm(`¿Eliminar ingreso de ${fmtUSD(item.monto)}?`)) return;
  const dist = calcDistribution(item.monto);
  state.ahorro_usd = Math.max(0, state.ahorro_usd - dist.ahorro_usd);
  state.ahorro_cop = Math.max(0, state.ahorro_cop - dist.ahorro_cop);
  state.inversion  = Math.max(0, state.inversion  - dist.inversion);
  state.ingresos = state.ingresos.filter(x => x.id !== id);
  saveState(); toast('Ingreso eliminado', 'info'); renderAll();
}

function updateIngresoPreview() {
  const monto = parseFloat(document.getElementById('ingreso-monto').value);
  const previewText  = document.getElementById('ingreso-preview-text');
  const previewBreak = document.getElementById('ingreso-preview-breakdown');

  if (!monto || monto <= 0) {
    previewText.style.display = 'block';
    previewBreak.style.display = 'none';
    return;
  }

  const dist = calcDistribution(monto);
  previewText.style.display = 'none';
  previewBreak.style.display = 'flex';

  previewBreak.innerHTML = [
    { label: 'Gastos',     val: fmtUSD(dist.gastos),     color: 'var(--accent-red)',    border: 'var(--accent-red)' },
    { label: 'Ahorro USD', val: fmtUSD(dist.ahorro_usd), color: 'var(--accent-green)',  border: 'var(--accent-green)' },
    { label: 'Ahorro COP', val: fmtUSD(dist.ahorro_cop), color: 'var(--accent-cyan)',   border: 'var(--accent-cyan)' },
    { label: 'Inversión',  val: fmtUSD(dist.inversion),  color: 'var(--accent-amber)',  border: 'var(--accent-amber)' },
  ].map(item => `
    <div class="breakdown-item" style="border-left-color:${item.border}">
      <span class="breakdown-item-label">${item.label}</span>
      <span class="breakdown-item-value" style="color:${item.color}">${item.val}</span>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════
// EXPENSES PAGE
// ═══════════════════════════════════════════════

function renderGastosPage() {
  renderGastosTable(state.gastos.slice().reverse().slice(0, 10), 'tbodyGastosRecent');
  renderCategoryBreakdown();
}

function renderGastosTable(data, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-text">Sin registros aún</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(g => `
    <tr>
      <td class="fw-mono" style="white-space:nowrap">${formatDisplayDate(g.fecha)}</td>
      <td><span class="tag tag-${categorySlug(g.categoria)}">${CATEGORY_EMOJIS[g.categoria] || ''} ${escHtml(g.categoria)}</span></td>
      <td>${escHtml(g.descripcion)}</td>
      <td class="amount-negative">${fmtUSD(g.monto)}</td>
      <td>
        <div class="tbl-actions">
          <button class="tbl-btn edit" onclick="editGasto('${g.id}')">Editar</button>
          <button class="tbl-btn del"  onclick="deleteGasto('${g.id}')">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderCategoryBreakdown() {
  const cats  = gastosPorCategoria();
  const total = Object.values(cats).reduce((a,v) => a+v, 0) || 1;
  const el    = document.getElementById('gastosCategoriasBreakdown');

  if (Object.keys(cats).length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">Sin gastos este mes</div></div>`;
    return;
  }

  el.innerHTML = Object.entries(cats).sort((a,b) => b[1]-a[1]).map(([cat, val]) => `
    <div class="cat-row">
      <div class="cat-label">${CATEGORY_EMOJIS[cat] || ''} ${cat}</div>
      <div class="cat-bar-wrap">
        <div class="cat-bar" style="width:${(val/total*100).toFixed(1)}%;background:${CATEGORY_COLORS[cat] || '#64748b'}"></div>
      </div>
      <div class="cat-amount">${fmtUSD(val)}</div>
    </div>
  `).join('');
}

function addGasto() {
  const fecha = document.getElementById('gasto-fecha').value;
  const cat   = document.getElementById('gasto-categoria').value;
  const desc  = document.getElementById('gasto-descripcion').value.trim();
  const monto = parseFloat(document.getElementById('gasto-monto').value);

  if (!fecha)             return toast('Selecciona una fecha', 'error');
  if (!cat)               return toast('Selecciona una categoría', 'error');
  if (!desc)              return toast('Agrega una descripción', 'error');
  if (!monto || monto<=0) return toast('Monto inválido', 'error');

  if (cat === 'Inversiones') state.inversion = Math.max(0, state.inversion - monto);
  if (cat === 'Ahorro COP')  state.ahorro_cop = Math.max(0, state.ahorro_cop - monto);
  if (cat === 'Ahorro USD')  state.ahorro_usd = Math.max(0, state.ahorro_usd - monto);

  const gasto = { id: uid(), fecha, categoria: cat, descripcion: desc, monto };
  state.gastos.push(gasto);
  saveState();
  toast(`Gasto ${fmtUSD(monto)} registrado`, 'success');

  document.getElementById('gasto-fecha').value = todayStr();
  document.getElementById('gasto-categoria').value = '';
  document.getElementById('gasto-descripcion').value = '';
  document.getElementById('gasto-monto').value = '';

  renderGastosPage();
  renderDashboard();
}

// Open modal to add gasto (from featured card)
function openGastoModal() {
  const body = `
    <div class="form-group">
      <label class="form-label">Fecha</label>
      <input type="date" class="form-input" id="modal-gasto-fecha" />
    </div>
    <div class="form-group">
      <label class="form-label">Categoría</label>
      <select class="form-input" id="modal-gasto-categoria">
        <option value="">Seleccionar categoría</option>
        <option value="Vivienda">🏠 Vivienda</option>
        <option value="Alimentación">🍔 Alimentación</option>
        <option value="Transporte">🚗 Transporte</option>
        <option value="Gimnasio">💪 Gimnasio</option>
        <option value="Seguros">🛡️ Seguros</option>
        <option value="Familia">👨‍👩‍👧 Familia</option>
        <option value="Ahorro COP">💰 Ahorro COP</option>
        <option value="Ahorro USD">💵 Ahorro USD</option>
        <option value="Inversiones">📈 Inversiones</option>
        <option value="Otros">📦 Otros</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <input type="text" class="form-input" id="modal-gasto-descripcion" placeholder="Ej: Supermercado" />
    </div>
    <div class="form-group">
      <label class="form-label">Monto (USD)</label>
      <div class="input-prefix-wrap">
        <span class="input-prefix">$</span>
        <input type="number" class="form-input input-with-prefix" id="modal-gasto-monto" placeholder="0.00" step="0.01" min="0" />
      </div>
    </div>
  `;
  openModal('Nuevo Gasto', body, () => addGastoFromModal());
  const el = document.getElementById('modal-gasto-fecha'); if (el) el.value = todayStr();
}

function addGastoFromModal() {
  const fecha = document.getElementById('modal-gasto-fecha').value;
  const cat   = document.getElementById('modal-gasto-categoria').value;
  const desc  = document.getElementById('modal-gasto-descripcion').value.trim();
  const monto = parseFloat(document.getElementById('modal-gasto-monto').value);
  if (!fecha)             return toast('Selecciona una fecha', 'error');
  if (!cat)               return toast('Selecciona una categoría', 'error');
  if (!desc)              return toast('Agrega una descripción', 'error');
  if (!monto || monto<=0) return toast('Monto inválido', 'error');

  if (cat === 'Inversiones') state.inversion = Math.max(0, state.inversion - monto);
  if (cat === 'Ahorro COP')  state.ahorro_cop = Math.max(0, state.ahorro_cop - monto);
  if (cat === 'Ahorro USD')  state.ahorro_usd = Math.max(0, state.ahorro_usd - monto);

  const gasto = { id: uid(), fecha, categoria: cat, descripcion: desc, monto };
  state.gastos.push(gasto);
  saveState();
  toast(`Gasto ${fmtUSD(monto)} registrado`, 'success');
  closeModal(); renderAll();
}

function editGasto(id) {
  const item = state.gastos.find(x => x.id === id);
  if (!item) return;
  const catOptions = Object.keys(CATEGORY_COLORS).map(c =>
    `<option value="${c}" ${c === item.categoria ? 'selected' : ''}>${CATEGORY_EMOJIS[c]} ${c}</option>`
  ).join('');

  openModal('Editar Gasto', `
    <div class="form-group"><label class="form-label">Fecha</label>
      <input type="date" class="form-input" id="m-fecha" value="${item.fecha}" /></div>
    <div class="form-group"><label class="form-label">Categoría</label>
      <select class="form-input" id="m-cat">${catOptions}</select></div>
    <div class="form-group"><label class="form-label">Descripción</label>
      <input type="text" class="form-input" id="m-desc" value="${escHtml(item.descripcion)}" /></div>
    <div class="form-group"><label class="form-label">Monto (USD)</label>
      <input type="number" class="form-input" id="m-monto" value="${item.monto}" step="0.01" /></div>
  `, () => {
    const fecha = document.getElementById('m-fecha').value;
    const cat   = document.getElementById('m-cat').value;
    const desc  = document.getElementById('m-desc').value.trim();
    const monto = parseFloat(document.getElementById('m-monto').value);
    if (!fecha || !cat || !desc || !monto) return toast('Completa todos los campos', 'error');

    if (item.categoria === 'Inversiones') state.inversion  += item.monto;
    if (item.categoria === 'Ahorro COP')  state.ahorro_cop += item.monto;
    if (item.categoria === 'Ahorro USD')  state.ahorro_usd += item.monto;
    if (cat === 'Inversiones') state.inversion  = Math.max(0, state.inversion  - monto);
    if (cat === 'Ahorro COP')  state.ahorro_cop = Math.max(0, state.ahorro_cop - monto);
    if (cat === 'Ahorro USD')  state.ahorro_usd = Math.max(0, state.ahorro_usd - monto);

    item.fecha = fecha; item.categoria = cat; item.descripcion = desc; item.monto = monto;
    saveState(); closeModal(); toast('Gasto actualizado ✓', 'success'); renderAll();
  });
}

function deleteGasto(id) {
  const item = state.gastos.find(x => x.id === id);
  if (!item) return;
  if (!confirm(`¿Eliminar gasto de ${fmtUSD(item.monto)}?`)) return;
  if (item.categoria === 'Inversiones') state.inversion  += item.monto;
  if (item.categoria === 'Ahorro COP')  state.ahorro_cop += item.monto;
  if (item.categoria === 'Ahorro USD')  state.ahorro_usd += item.monto;
  state.gastos = state.gastos.filter(x => x.id !== id);
  saveState(); toast('Gasto eliminado', 'info'); renderAll();
}

// ═══════════════════════════════════════════════
// CHARTS — Light Theme 2026
// ═══════════════════════════════════════════════

const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#4B5068',
        font: { family: 'DM Mono', size: 11 },
        padding: 18,
        usePointStyle: true,
        pointStyleWidth: 8,
      }
    },
    tooltip: {
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(0,0,0,0.08)',
      borderWidth: 1,
      titleColor: '#0A0A12',
      bodyColor: '#4B5068',
      padding: 14,
      cornerRadius: 12,
      titleFont: { family: 'Syne', weight: '700', size: 13 },
      bodyFont: { family: 'DM Mono', size: 12 },
    },
  },
  scales: {
    x: {
      ticks: { color: '#9AA0B8', font: { family: 'DM Mono', size: 10 }, maxRotation: 0 },
      grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
      border: { display: false },
    },
    y: {
      ticks: {
        color: '#9AA0B8',
        font: { family: 'DM Mono', size: 10 },
        callback: v => '$' + v.toLocaleString(),
      },
      grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
      border: { display: false },
    },
  },
};

function renderChartBalance() {
  destroyChart('chartBalanceDash');
  const ctx = document.getElementById('chartBalanceDash');
  if (!ctx) return;

  const months = ingresosPorMes(6);
  const gastosMes = [];
  for (let i = 5; i >= 0; i--) {
    const range = getMonthRange(-i);
    const g = state.gastos.filter(x => inRange(x.fecha, range)).reduce((a,x) => a+x.monto, 0);
    gastosMes.push(g + monthlyRecurringCost());
  }

  chartInstances['chartBalanceDash'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        {
          label: 'Ingresos',
          data: months.map(m => m.total),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#10B981',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
        },
        {
          label: 'Gastos',
          data: gastosMes,
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239,68,68,0.06)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#EF4444',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { ...chartDefaults.plugins.legend, position: 'top' }
      }
    },
  });
}

function renderGraficosPage() {
  // 1. Gastos por categoría (donut)
  destroyChart('chartGastosCat');
  const ctx1 = document.getElementById('chartGastosCat');
  if (ctx1) {
    const cats   = gastosPorCategoria();
    const labels = Object.keys(cats);
    const data   = Object.values(cats);
    const colors = labels.map(l => CATEGORY_COLORS[l] || '#94A3B8');

    chartInstances['chartGastosCat'] = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderColor: '#FFFFFF', borderWidth: 3, hoverOffset: 8 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          ...chartDefaults.plugins,
          legend: { ...chartDefaults.plugins.legend, position: 'right' }
        },
      },
    });
  }

  // 2. Ingresos por mes (bar)
  destroyChart('chartIngresosMes');
  const ctx2 = document.getElementById('chartIngresosMes');
  if (ctx2) {
    const months = ingresosPorMes(6);
    chartInstances['chartIngresosMes'] = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [{
          label: 'Ingresos USD',
          data: months.map(m => m.total),
          backgroundColor: 'rgba(79,70,229,0.15)',
          borderColor: '#4F46E5',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: chartDefaults,
    });
  }

  // 3. Ahorro acumulado (line)
  destroyChart('chartAhorro');
  const ctx3 = document.getElementById('chartAhorro');
  if (ctx3) {
    const months = ahorroPorMes(6);
    chartInstances['chartAhorro'] = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [{
          label: 'Ahorro USD',
          data: months.map(m => m.total),
          borderColor: '#06B6D4',
          backgroundColor: 'rgba(6,182,212,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#06B6D4',
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
        }],
      },
      options: chartDefaults,
    });
  }

  // 4. Patrimonio neto (line)
  destroyChart('chartPatrimonio');
  const ctx4 = document.getElementById('chartPatrimonio');
  if (ctx4) {
    const months = patrimonioNeto(6);
    chartInstances['chartPatrimonio'] = new Chart(ctx4, {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [{
          label: 'Patrimonio Neto',
          data: months.map(m => m.total),
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139,92,246,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#8B5CF6',
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
        }],
      },
      options: chartDefaults,
    });
  }
}

// ═══════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════

function renderReportesPage() {
  renderReporteSemanal();
  renderReporteMensual();
}

function renderReporteSemanal() {
  const range = getWeekRange();
  const ing = state.ingresos.filter(i => inRange(i.fecha, range)).reduce((a,x) => a+x.monto, 0);
  const gas = state.gastos.filter(g => inRange(g.fecha, range)).reduce((a,x) => a+x.monto, 0) + weeklyRecurringCost();
  const bal = ing - gas;

  const el = document.getElementById('reporteSemanalGrid');
  el.innerHTML = [
    { label: 'Ingresos', val: fmtUSD(ing), color: 'var(--accent-green)',  sub: 'Esta semana' },
    { label: 'Gastos',   val: fmtUSD(gas), color: 'var(--accent-red)',    sub: 'Esta semana' },
    { label: 'Balance',  val: fmtUSD(bal), color: bal >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', sub: 'Diferencia' },
  ].map(c => `
    <div class="report-card">
      <div class="report-card-label">${c.label}</div>
      <div class="report-card-value" style="color:${c.color}">${c.val}</div>
      <div class="report-card-sub">${c.sub}</div>
    </div>
  `).join('');
}

function renderReporteMensual() {
  const range  = getMonthRange();
  const ing    = state.ingresos.filter(i => inRange(i.fecha, range)).reduce((a,x) => a+x.monto, 0);
  const gas    = state.gastos.filter(g => inRange(g.fecha, range)).reduce((a,x) => a+x.monto, 0) + monthlyRecurringCost();
  const dist   = calcDistribution(ing);
  const ahorro = dist.ahorro_usd;
  const inv    = dist.inversion;
  const bal    = ing - gas;

  const el = document.getElementById('reporteMensualGrid');
  el.innerHTML = [
    { label: 'Total Ingresado', val: fmtUSD(ing),    color: 'var(--accent-green)',  sub: 'Este mes' },
    { label: 'Total Gastado',   val: fmtUSD(gas),    color: 'var(--accent-red)',    sub: 'Incluye recurrentes' },
    { label: 'Total Ahorrado',  val: fmtUSD(ahorro), color: 'var(--accent-cyan)',   sub: 'USD este mes' },
    { label: 'Total Invertido', val: fmtUSD(inv),    color: 'var(--accent-amber)',  sub: 'Este mes' },
    { label: 'Balance Final',   val: fmtUSD(bal),    color: bal >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', sub: 'Ingresos − Gastos' },
  ].map(c => `
    <div class="report-card">
      <div class="report-card-label">${c.label}</div>
      <div class="report-card-value" style="color:${c.color}">${c.val}</div>
      <div class="report-card-sub">${c.sub}</div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════

let histFilter = { search: '', mes: '' };

function renderHistorialPage() {
  let ingresos = state.ingresos.slice().reverse();
  let gastos   = state.gastos.slice().reverse();

  if (histFilter.search) {
    const q = histFilter.search.toLowerCase();
    ingresos = ingresos.filter(i => i.descripcion.toLowerCase().includes(q) || i.monto.toString().includes(q));
    gastos   = gastos.filter(g => g.descripcion.toLowerCase().includes(q) || g.categoria.toLowerCase().includes(q) || g.monto.toString().includes(q));
  }

  if (histFilter.mes) {
    ingresos = ingresos.filter(i => monthKey(i.fecha) === histFilter.mes);
    gastos   = gastos.filter(g => monthKey(g.fecha) === histFilter.mes);
  }

  renderIngresosTable(ingresos, 'tbodyHistIngresos');
  renderGastosTable(gastos, 'tbodyHistGastos');
}

// ═══════════════════════════════════════════════
// AI INTELLIGENCE
// ═══════════════════════════════════════════════

function renderInteligenciaPage() {
  const t = calcTotals();
  const month = getMonthRange();
  const prevMonth = getMonthRange(-1);

  const ingMes  = state.ingresos.filter(i => inRange(i.fecha, month)).reduce((a,x) => a+x.monto, 0);
  const ingPrev = state.ingresos.filter(i => inRange(i.fecha, prevMonth)).reduce((a,x) => a+x.monto, 0);
  const gasMes  = state.gastos.filter(g => inRange(g.fecha, month)).reduce((a,x) => a+x.monto, 0) + monthlyRecurringCost();
  const gasPrev = state.gastos.filter(g => inRange(g.fecha, prevMonth)).reduce((a,x) => a+x.monto, 0) + monthlyRecurringCost();

  const dist = calcDistribution(ingMes);
  const tasaAhorro = ingMes > 0 ? ((dist.ahorro_usd / ingMes) * 100).toFixed(1) : 0;
  const cats   = gastosPorCategoria();
  const topCat = Object.entries(cats).sort((a,b) => b[1]-a[1])[0];

  const ahorroMes  = state.ingresos.filter(i => inRange(i.fecha, month)).reduce((a,x) => a+calcDistribution(x.monto).ahorro_usd, 0);
  const ahorroPrev = state.ingresos.filter(i => inRange(i.fecha, prevMonth)).reduce((a,x) => a+calcDistribution(x.monto).ahorro_usd, 0);

  const insights = [];

  insights.push({
    type: parseFloat(tasaAhorro) >= 20 ? 'positive' : 'warning',
    icon: '💰',
    text: `Tu <strong>tasa de ahorro es del ${tasaAhorro}%</strong> este mes. ${parseFloat(tasaAhorro) >= 20 ? 'Excelente — estás por encima del 20% recomendado.' : 'Lo ideal es ahorrar al menos un 20% de tus ingresos.'}`,
  });

  if (topCat) {
    const pct = (topCat[1] / (gasMes || 1) * 100).toFixed(1);
    insights.push({
      type: parseFloat(pct) > 40 ? 'warning' : 'info',
      icon: CATEGORY_EMOJIS[topCat[0]] || '📊',
      text: `Tu mayor gasto es <strong>${topCat[0]}</strong> con <strong>${fmtUSD(topCat[1])}</strong> (${pct}% del total). ${parseFloat(pct) > 40 ? 'Considera revisar si puedes reducir este gasto.' : 'Está dentro de rangos normales.'}`,
    });
  }

  if (ingPrev > 0) {
    const diff = ahorroMes - ahorroPrev;
    insights.push({
      type: diff >= 0 ? 'positive' : 'negative',
      icon: diff >= 0 ? '📈' : '📉',
      text: diff >= 0
        ? `Este mes ahorraste <strong>${fmtUSD(diff)} más</strong> que el mes anterior. ¡Sigue así!`
        : `Este mes ahorraste <strong>${fmtUSD(Math.abs(diff))} menos</strong> que el mes anterior. Revisa tus gastos.`,
    });
  }

  const extraInv = Math.max(0, t.disponible * 0.5);
  if (extraInv > 0) {
    insights.push({
      type: 'info',
      icon: '📈',
      text: `Con tu dinero disponible, podrías <strong>invertir ${fmtUSD(extraInv)} adicionales</strong> este mes (50% del disponible).`,
    });
  }

  const recPct = ingMes > 0 ? (monthlyRecurringCost() / ingMes * 100).toFixed(1) : 0;
  insights.push({
    type: parseFloat(recPct) > 50 ? 'negative' : 'info',
    icon: '🔄',
    text: `Tus gastos recurrentes representan el <strong>${recPct}% de tus ingresos</strong> (${fmtUSD(monthlyRecurringCost())}/mes). ${parseFloat(recPct) > 50 ? 'Atención: más de la mitad de tus ingresos están comprometidos.' : 'Mantén este nivel para tener flexibilidad.'}`,
  });

  const bal = ingMes - gasMes;
  insights.push({
    type: bal >= 0 ? 'positive' : 'negative',
    icon: bal >= 0 ? '✅' : '⚠️',
    text: bal >= 0
      ? `Tu balance mensual es <strong>positivo: ${fmtUSD(bal)}</strong>. Tus ingresos superan tus gastos.`
      : `Tu balance mensual es <strong>negativo: ${fmtUSD(bal)}</strong>. Estás gastando más de lo que ganas.`,
  });

  const grid = document.getElementById('insightsGrid');
  grid.innerHTML = insights.map(ins => `
    <div class="insight-card ${ins.type}">
      <div class="insight-icon">${ins.icon}</div>
      <div class="insight-text">${ins.text}</div>
    </div>
  `).join('');

  const metrics = [
    { label: 'Tasa de Ahorro',     val: `${tasaAhorro}%`,               color: 'var(--accent-green)'  },
    { label: 'Gastos Recurrentes', val: fmtUSD(monthlyRecurringCost()),  color: 'var(--accent-red)'    },
    { label: 'Ahorro Acumulado',   val: fmtUSD(state.ahorro_usd),        color: 'var(--accent-cyan)'   },
    { label: 'Inversión Total',    val: fmtUSD(state.inversion),         color: 'var(--accent-amber)'  },
    { label: 'Patrimonio',         val: fmtUSD(t.ingTotal - t.gasTotal - monthlyRecurringCost() * 6), color: 'var(--accent-purple)' },
    { label: 'Balance Mensual',    val: fmtUSD(ingMes - gasMes),         color: (ingMes - gasMes) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
  ];

  document.getElementById('metricsGrid').innerHTML = metrics.map(m => `
    <div class="metric-item">
      <div class="metric-label">${m.label}</div>
      <div class="metric-value" style="color:${m.color}">${m.val}</div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════

function renderConfigPage() {
  const c = state.config;
  document.getElementById('cfg-gastos').value     = c.pct_gastos;
  document.getElementById('cfg-ahorro-usd').value = c.pct_ahorro_usd;
  document.getElementById('cfg-ahorro-cop').value = c.pct_inversion;
  document.getElementById('cfg-inversion').value  = c.pct_inversion;
  document.getElementById('cfg-tasa-cop').value   = c.tasa_cop;
  updateConfigPctLabels();
  renderRecurringMgmt();
}

function updateConfigPctLabels() {
  const g  = parseInt(document.getElementById('cfg-gastos').value);
  const au = parseInt(document.getElementById('cfg-ahorro-usd').value);
  const ac = parseInt(document.getElementById('cfg-ahorro-cop').value);
  const iv = parseInt(document.getElementById('cfg-inversion').value);
  const total = g + au + iv + iv;

  document.getElementById('cfg-gastos-pct').textContent     = g  + '%';
  document.getElementById('cfg-ahorro-usd-pct').textContent = au + '%';
  document.getElementById('cfg-ahorro-cop-pct').textContent = iv + '%';
  document.getElementById('cfg-inversion-pct').textContent  = iv + '%';
  document.getElementById('cfg-ahorro-cop').value = iv;

  const totalEl = document.getElementById('cfg-total-pct');
  totalEl.textContent = total + '%';
  totalEl.className   = 'pct-total' + (total !== 100 ? ' error' : '');
}

function saveConfig() {
  const g  = parseInt(document.getElementById('cfg-gastos').value);
  const au = parseInt(document.getElementById('cfg-ahorro-usd').value);
  const iv = parseInt(document.getElementById('cfg-inversion').value);
  const total = g + au + iv + iv;

  if (total !== 100) return toast(`Los porcentajes suman ${total}%, deben sumar 100%`, 'error');

  state.config.pct_gastos     = g;
  state.config.pct_ahorro_usd = au;
  state.config.pct_ahorro_cop = iv;
  state.config.pct_inversion  = iv;
  saveState();
  toast('Configuración guardada ✓', 'success');
  renderDashboard();
}

function saveTasa() {
  const tasa = parseFloat(document.getElementById('cfg-tasa-cop').value);
  if (!tasa || tasa <= 0) return toast('Tasa inválida', 'error');
  state.config.tasa_cop = tasa;
  saveState();
  toast(`Tasa actualizada: 1 USD = ${tasa.toLocaleString()} COP`, 'success');
  renderDashboard();
}

function renderRecurringMgmt() {
  const el = document.getElementById('recurringMgmtGrid');
  el.innerHTML = state.recurring.map(r => `
    <div class="rec-mgmt-item">
      <div class="rec-mgmt-info">
        <div class="rec-mgmt-name">${CATEGORY_EMOJIS[r.categoria] || '📦'} ${escHtml(r.nombre)}</div>
        <div class="rec-mgmt-meta">${r.frecuencia} · ${r.categoria}</div>
      </div>
      <div class="rec-mgmt-amount">${fmtUSD(r.monto)}</div>
      <button class="rec-del-btn" onclick="deleteRecurring('${r.id}')" title="Eliminar">✕</button>
    </div>
  `).join('');
}

function deleteRecurring(id) {
  state.recurring = state.recurring.filter(r => r.id !== id);
  saveState();
  renderRecurringMgmt();
  renderDashboard();
  toast('Gasto recurrente eliminado', 'info');
}

function addRecurring() {
  const nombre     = document.getElementById('rec-nombre').value.trim();
  const monto      = parseFloat(document.getElementById('rec-monto').value);
  const frecuencia = document.getElementById('rec-frecuencia').value;
  const categoria  = document.getElementById('rec-categoria').value;

  if (!nombre)            return toast('Escribe un nombre', 'error');
  if (!monto || monto<=0) return toast('Monto inválido', 'error');

  state.recurring.push({ id: uid(), nombre, monto, frecuencia, categoria });
  saveState();
  document.getElementById('rec-nombre').value = '';
  document.getElementById('rec-monto').value  = '';
  renderRecurringMgmt();
  renderDashboard();
  toast('Gasto recurrente agregado ✓', 'success');
}

// ═══════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════

let modalSaveCallback = null;

function openModal(title, body, onSave) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  modalSaveCallback = onSave;
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  modalSaveCallback = null;
}

// ═══════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════

function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 280);
  }, 3400);
}

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════

const PAGE_TITLES = {
  dashboard:     'Dashboard',
  ingresos:      'Ingresos',
  gastos:        'Gastos',
  graficos:      'Gráficos',
  reportes:      'Reportes',
  historial:     'Historial',
  inteligencia:  'Análisis IA',
  configuracion: 'Configuración',
};

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });

  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;

  switch(page) {
    case 'dashboard':      renderDashboard(); break;
    case 'ingresos':       renderIngresosPage(); break;
    case 'gastos':         renderGastosPage(); break;
    case 'graficos':       renderGraficosPage(); break;
    case 'reportes':       renderReportesPage(); break;
    case 'historial':      renderHistorialPage(); break;
    case 'inteligencia':   renderInteligenciaPage(); break;
    case 'configuracion':  renderConfigPage(); break;
  }

  closeMobileSidebar();

  // Animate sections and re-apply effects
  const activePage = document.getElementById(`page-${page}`);
  if (activePage) animatePageSections(activePage);

  setTimeout(() => {
    initTiltEffect('.card');
    initTiltEffect('.report-card');
    initTiltEffect('.insight-card');
    initTiltEffect('.metric-item');
    initMagneticButtons();
  }, 60);
}

// ═══════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      const parent = btn.closest('section') || document;

      parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      parent.querySelectorAll('.tab-content').forEach(tc => {
        tc.classList.toggle('active', tc.id === `tab-${tabId}`);
      });
    });
  });
}

// ═══════════════════════════════════════════════
// MOBILE SIDEBAR
// ═══════════════════════════════════════════════

function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════
// DATA EXPORT / RESET
// ═══════════════════════════════════════════════

function exportData() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financeOS_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Datos exportados ✓', 'success');
}

function resetData() {
  if (!confirm('¿Seguro que quieres borrar TODOS los datos? Esta acción no se puede deshacer.')) return;
  if (!confirm('Confirmación final: ¿Borrar todo?')) return;
  localStorage.removeItem('financeOS_v1');
  state = { ingresos: [], gastos: [], config: { ...DEFAULT_CONFIG }, recurring: [...DEFAULT_RECURRING], ahorro_usd: 0, ahorro_cop: 0, inversion: 0 };
  renderAll();
  toast('Datos eliminados', 'warning');
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDisplayDate(dateStr) {
  try {
    return parseDate(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return dateStr; }
}

function renderAll() {
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    const pageId = activePage.id.replace('page-', '');
    navigateTo(pageId);
  }
}

// ═══════════════════════════════════════════════
// ANIMATIONS — 3D Tilt Effect
// ═══════════════════════════════════════════════

function initTiltEffect(selector) {
  document.querySelectorAll(selector).forEach(card => {
    if (card.dataset.tiltInit) return;
    card.dataset.tiltInit = '1';

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width  / 2;
      const cy = rect.height / 2;
      const rx = (y - cy) / cy * -5;
      const ry = (x - cx) / cx * 5;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.01,1.01,1.01)`;
      card.style.transition = 'transform 0.08s ease';

      // Dynamic highlight
      const pctX = (x / rect.width  * 100).toFixed(1);
      const pctY = (y / rect.height * 100).toFixed(1);
      card.style.background = `radial-gradient(circle at ${pctX}% ${pctY}%, rgba(79,70,229,0.04) 0%, transparent 60%), var(--bg-card)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(900px) rotateX(0) rotateY(0) scale3d(1,1,1)';
      card.style.transition = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease, border-color 0.2s ease';
      card.style.background = '';
    });
  });
}

// ═══════════════════════════════════════════════
// ANIMATIONS — Magnetic Buttons
// ═══════════════════════════════════════════════

function initMagneticButtons() {
  document.querySelectorAll('.btn-primary, .btn-danger').forEach(btn => {
    if (btn.dataset.magInit) return;
    btn.dataset.magInit = '1';

    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width  / 2;
      const y = e.clientY - rect.top  - rect.height / 2;
      btn.style.transform = `translate(${x * 0.18}px, ${y * 0.18}px) translateY(-2px)`;
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
      btn.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, filter 0.15s ease';
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.transition = 'transform 0.12s ease, box-shadow 0.2s ease, filter 0.15s ease';
    });

    btn.addEventListener('mousedown', () => {
      btn.style.transform += ' scale(0.96)';
    });
  });
}

// ═══════════════════════════════════════════════
// ANIMATIONS — Custom Cursor
// ═══════════════════════════════════════════════

function initCustomCursor() {
  const dot  = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  if (!dot || !ring) return;

  // Hide on touch devices
  if ('ontouchstart' in window) {
    dot.style.display  = 'none';
    ring.style.display = 'none';
    return;
  }

  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = mouseX + 'px';
    dot.style.top  = mouseY + 'px';
  });

  function animateRing() {
    ringX += (mouseX - ringX) * 0.14;
    ringY += (mouseY - ringY) * 0.14;
    ring.style.left = ringX + 'px';
    ring.style.top  = ringY + 'px';
    requestAnimationFrame(animateRing);
  }
  requestAnimationFrame(animateRing);

  // Hover state on interactive elements
  const interactiveSelector = 'button, a, .nav-item, .card, .report-card, .insight-card, .metric-item, .chart-card, .tbl-btn, .tab-btn, input, select';

  document.addEventListener('mouseover', (e) => {
    if (e.target.matches(interactiveSelector) || e.target.closest(interactiveSelector)) {
      ring.classList.add('cursor-ring--hover');
      dot.classList.add('cursor-dot--hover');
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (e.target.matches(interactiveSelector) || e.target.closest(interactiveSelector)) {
      ring.classList.remove('cursor-ring--hover');
      dot.classList.remove('cursor-dot--hover');
    }
  });

  document.addEventListener('mousedown', () => {
    ring.style.transform = 'translate(-50%, -50%) scale(0.85)';
  });

  document.addEventListener('mouseup', () => {
    ring.style.transform = 'translate(-50%, -50%) scale(1)';
  });
}

// ═══════════════════════════════════════════════
// ANIMATIONS — Page section stagger
// ═══════════════════════════════════════════════

function animatePageSections(pageEl) {
  const targets = pageEl.querySelectorAll('.form-card, .chart-card, .section-block, .dashboard-panel, .dist-panel, .dashboard-bottom');
  targets.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `opacity 0.35s ease ${i * 55}ms, transform 0.45s cubic-bezier(0.34,1.56,0.64,1) ${i * 55}ms`;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  });
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════

function init() {
  loadState();

  // Set today date on forms
  ['ingreso-fecha', 'gasto-fecha'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = todayStr();
  });

  // Sidebar date
  const dateEl = document.getElementById('sidebarDate');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // Mobile menu
  document.getElementById('mobileMenuBtn').addEventListener('click', openMobileSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', () => {
    renderAll();
    toast('Datos actualizados ✓', 'info');
  });

  // Income form
  document.getElementById('btnAddIngreso').addEventListener('click', addIngreso);
  document.getElementById('ingreso-monto').addEventListener('input', updateIngresoPreview);
  document.getElementById('ingreso-monto').addEventListener('keydown', e => { if (e.key === 'Enter') addIngreso(); });

  // Expense form
  document.getElementById('btnAddGasto').addEventListener('click', addGasto);
  document.getElementById('gasto-monto').addEventListener('keydown', e => { if (e.key === 'Enter') addGasto(); });

  // Config ranges
  ['cfg-gastos','cfg-ahorro-usd'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateConfigPctLabels);
  });
  document.getElementById('cfg-inversion').addEventListener('input', e => {
    document.getElementById('cfg-ahorro-cop').value = e.target.value;
    updateConfigPctLabels();
  });
  document.getElementById('cfg-ahorro-cop').addEventListener('input', e => {
    document.getElementById('cfg-inversion').value = e.target.value;
    updateConfigPctLabels();
  });
  document.getElementById('btnSaveConfig').addEventListener('click', saveConfig);
  document.getElementById('btnSaveTasa').addEventListener('click', saveTasa);
  document.getElementById('btnAddRecurring').addEventListener('click', addRecurring);
  document.getElementById('btnExportData').addEventListener('click', exportData);
  document.getElementById('btnResetData').addEventListener('click', resetData);

  // Historial search/filter
  document.getElementById('historialFiltroBtn').addEventListener('click', () => {
    histFilter.search = document.getElementById('historialSearch').value.trim();
    histFilter.mes    = document.getElementById('historialFiltroMes').value;
    renderHistorialPage();
  });

  document.getElementById('historialClearBtn').addEventListener('click', () => {
    document.getElementById('historialSearch').value = '';
    document.getElementById('historialFiltroMes').value = '';
    histFilter = { search: '', mes: '' };
    renderHistorialPage();
  });

  document.getElementById('historialSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      histFilter.search = e.target.value.trim();
      renderHistorialPage();
    }
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', () => {
    if (modalSaveCallback) modalSaveCallback();
  });
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Tabs
  initTabs();

  // Premium animations
  // custom cursor disabled per user preference

  // Initial render
  navigateTo('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
