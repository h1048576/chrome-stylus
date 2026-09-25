'use strict';

/* ===== 存储层：扩展环境用 chrome.storage；直接双击打开页面预览时用 localStorage 模拟 ===== */
function createShim() {
  const KEY = 'simplestyle';
  const listeners = [];
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  };
  return {
    async get(keys) {
      const data = read();
      const out = {};
      for (const k of [].concat(keys)) if (k in data) out[k] = data[k];
      return out;
    },
    async set(obj) {
      localStorage.setItem(KEY, JSON.stringify(Object.assign(read(), obj)));
      setTimeout(() => {
        const changes = {};
        for (const k in obj) changes[k] = { oldValue: null, newValue: obj[k] };
        listeners.forEach(fn => fn(changes, 'local'));
      }, 0);
    },
    onChanged: { addListener(fn) { listeners.push(fn); } },
  };
}

const extStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const store = extStorage
  ? {
      get: keys => chrome.storage.local.get(keys),
      set: obj => chrome.storage.local.set(obj),
      onChanged: chrome.storage.onChanged,
    }
  : createShim();

/* ===== 状态 ===== */
let styles = [];
let selectedId = null;
let saveTimer = null;
let pendingSave = false;

const $ = sel => document.querySelector(sel);
const listEl = $('#style-list');
const metaEl = $('#meta-body');
const cssEditor = $('#css-editor');
const highlightEl = $('#highlight');
const gutterEl = $('#gutter');
const cssInfo = $('#css-info');
const themeBtn = $('#btn-theme');
const btnToggle = $('#btn-toggle');

const RULE_TYPES = [
  ['all', '所有'],
  ['url', 'URL'],
  ['prefix', '前缀'],
  ['domain', '域名'],
  ['regex', '正则'],
];
const PLACEHOLDERS = {
  all: '对全部页面生效，无需填写',
  url: '完整地址，如 https://example.com/page',
  prefix: '地址前缀，如 https://example.com/blog/',
  domain: '如 example.com（含子域名）',
  regex: '正则表达式，如 \\.pdf$',
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const current = () => styles.find(s => s.id === selectedId) || null;

const EXAMPLE = {
  id: uid(),
  name: '示例：夜间模式',
  enabled: true,
  rules: [{ type: 'domain', value: 'example.com' }],
  css: '/* 把页面变成夜间模式 */\nhtml {\n  filter: invert(1) hue-rotate(180deg);\n}\nimg, video, iframe {\n  filter: invert(1) hue-rotate(180deg);\n}',
};

/* ===== 保存 ===== */
function scheduleSave() {
  pendingSave = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}

function flushSave() {
  if (!pendingSave) return;
  pendingSave = false;
  clearTimeout(saveTimer);
  store.set({ styles });
}

/* ===== 渲染 ===== */
function renderAll() { renderList(); renderMeta(); }

function renderList() {
  listEl.textContent = '';
  if (!styles.length) {
    const p = document.createElement('div');
    p.className = 'hint';
    p.textContent = '还没有样式，\n点击右上角「＋ 新建」';
    listEl.appendChild(p);
    updateToggleBtn();
    return;
  }
  for (const s of styles) {
    const item = document.createElement('div');
    item.className = 'style-item' + (s.id === selectedId ? ' active' : '') + (s.enabled ? '' : ' off');
    item.title = s.name || '未命名';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!s.enabled;
    cb.title = '启用 / 停用';
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      s.enabled = cb.checked;
      item.classList.toggle('off', !s.enabled);
      updateToggleBtn();
      scheduleSave();
    });

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = s.name || '未命名';

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = '删除';
    del.addEventListener('click', e => {
      e.stopPropagation();
      removeStyle(s.id);
    });

    item.append(cb, name, del);
    item.addEventListener('click', () => {
      if (selectedId !== s.id) { selectedId = s.id; renderAll(); }
    });
    listEl.appendChild(item);
  }
  updateToggleBtn();
}

function renderMeta() {
  const s = current();
  metaEl.textContent = '';
  if (!s) {
    const p = document.createElement('div');
    p.className = 'hint';
    p.textContent = '从左侧选择一个样式，或点击「＋ 新建」';
    metaEl.appendChild(p);
    cssEditor.value = '';
    cssEditor.disabled = true;
    updateGutter();
    updateHighlight();
    cssInfo.textContent = '';
    return;
  }
  cssEditor.disabled = false;

  const lbName = document.createElement('div');
  lbName.className = 'field-label';
  lbName.textContent = '名称';

  const nameInput = document.createElement('input');
  nameInput.value = s.name || '';
  nameInput.placeholder = '样式名称';
  nameInput.addEventListener('input', () => {
    s.name = nameInput.value;
    renderList(); // 只重建左侧列表，当前输入框焦点不丢
    scheduleSave();
  });

  const lbRules = document.createElement('div');
  lbRules.className = 'field-label';
  lbRules.textContent = '生效范围（满足任意一条即生效）';

  const rulesBox = document.createElement('div');
  rulesBox.className = 'rules-box';
  s.rules.forEach((r, i) => rulesBox.appendChild(ruleRow(s, i)));

  const addRuleBtn = document.createElement('button');
  addRuleBtn.className = 'btn btn-ghost';
  addRuleBtn.textContent = '＋ 添加规则';
  addRuleBtn.addEventListener('click', () => {
    s.rules.push({ type: 'domain', value: '', enabled: true });
    renderMeta();
    scheduleSave();
    const inputs = metaEl.querySelectorAll('.rule-row input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  metaEl.append(lbName, nameInput, lbRules, rulesBox, addRuleBtn);

  cssEditor.value = s.css || '';
  updateGutter();
  updateHighlight();
  updateCssInfo();
}

function ruleRow(s, index) {
  const r = s.rules[index];
  const row = document.createElement('div');
  row.className = 'rule-row' + (r.enabled === false ? ' off' : '');

  // 该条规则的启用开关
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = r.enabled !== false;
  cb.title = '启用 / 停用该规则';
  cb.addEventListener('click', e => e.stopPropagation());
  cb.addEventListener('change', () => {
    r.enabled = cb.checked;
    row.classList.toggle('off', !cb.checked);
    scheduleSave();
  });

  const sel = document.createElement('select');
  for (const [val, label] of RULE_TYPES) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (r.type === val) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    r.type = sel.value;
    input.placeholder = PLACEHOLDERS[r.type] || '';
    input.disabled = r.type === 'all';
    validate();
    scheduleSave();
  });

  const input = document.createElement('input');
  input.value = r.value || '';
  input.placeholder = PLACEHOLDERS[r.type] || '';
  input.disabled = r.type === 'all';
  input.addEventListener('input', () => {
    r.value = input.value;
    validate();
    scheduleSave();
  });

  function validate() {
    let ok = true;
    let msg = '';
    const val = (r.value || '').trim();
    if (r.type === 'regex' && val) {
      try { new RegExp(val); } catch (e) { ok = false; msg = '正则表达式语法有误'; }
    }
    if (ok && r.type !== 'all' && !val) {
      ok = false;
      msg = '请填写匹配值，否则这条规则永远不会命中';
    }
    input.classList.toggle('invalid', !ok);
    input.title = msg;
  }
  validate();

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '×';
  del.title = '删除规则';
  del.addEventListener('click', () => {
    s.rules.splice(index, 1);
    if (!s.rules.length) s.rules.push({ type: 'all', value: '', enabled: true }); // 至少保留一条
    renderMeta();
    scheduleSave();
  });

  row.append(cb, sel, input, del);
  return row;
}

function removeStyle(id) {
  const s = styles.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`确定删除「${s.name || '未命名'}」吗？`)) return;
  styles = styles.filter(x => x.id !== id);
  if (selectedId === id) selectedId = styles.length ? styles[0].id : null;
  pendingSave = true;
  flushSave();
  renderAll();
}

/* ===== CSS 编辑器（透明输入层 + 高亮渲染层） ===== */

// 轻量 CSS 分词高亮：注释 / 字符串 / @规则 / 选择器 / 属性 / 数值·颜色 / !important
function highlightCSS(src) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '';
  let i = 0;
  let depth = 0; // {} 深度：0 = 选择器区，>0 = 声明区
  const len = src.length;

  const emit = (cls, text) => {
    out += cls ? '<span class="tk-' + cls + '">' + esc(text) + '</span>' : esc(text);
  };

  const ID_RE = /^-?-?[A-Za-z_][\w-]*/;
  const HEX_RE = /^#[0-9a-fA-F]{3,8}\b/;
  const NUM_RE = /^-?\d*\.?\d+(?:%|[a-zA-Z]+)?/;

  while (i < len) {
    const ch = src[i];

    // 注释 /* ... */（未闭合时也算注释，注释在 CSS 中即生效语法）
    if (ch === '/' && src[i + 1] === '*') {
      let end = src.indexOf('*/', i + 2);
      end = end === -1 ? len : end + 2;
      emit('comment', src.slice(i, end));
      i = end;
      continue;
    }

    // 字符串
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < len && src[j] !== ch) {
        if (src[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, len);
      emit('string', src.slice(i, j));
      i = j;
      continue;
    }

    // @规则 @media / @import / @font-face ...
    if (ch === '@') {
      const m = /^@[\w-]+/.exec(src.slice(i));
      emit('atrule', m ? m[0] : ch);
      i += m ? m[0].length : 1;
      continue;
    }

    if (ch === '{') { depth++; emit('', ch); i++; continue; }
    if (ch === '}') { depth = Math.max(0, depth - 1); emit('', ch); i++; continue; }
    if (ch === ';') { emit('', ch); i++; continue; }

    if (depth === 0) {
      // 选择器区：整段读到下一个特殊字符
      let j = i;
      while (j < len) {
        const c = src[j];
        if (c === '{' || c === '}' || c === ';') break;
        if (c === '/' && src[j + 1] === '*') break;
        if (c === '"' || c === "'" || c === '@') break;
        j++;
      }
      if (j === i) { emit('', ch); i++; } else { emit('selector', src.slice(i, j)); i = j; }
      continue;
    }

    // 声明区
    const rest = src.slice(i);
    let m = /^!\s*important/i.exec(rest);
    if (m) { emit('important', m[0]); i += m[0].length; continue; }

    m = ID_RE.exec(rest);
    if (m) {
      const ident = m[0];
      let k = i + ident.length;
      while (k < len && (src[k] === ' ' || src[k] === '\t')) k++;
      if (src[k] === ':') {              // 标识符后跟冒号 → 属性名
        emit('property', ident);
        emit('', src.slice(i + ident.length, k + 1));
        i = k + 1;
        continue;
      }
      if (src[i + ident.length] === '(') { // 函数 var( / url( / rgb(
        emit('fn', ident + '(');
        i += ident.length + 1;
        continue;
      }
      emit('', ident);
      i += ident.length;
      continue;
    }

    m = HEX_RE.exec(rest) || NUM_RE.exec(rest);
    if (m) { emit('number', m[0]); i += m[0].length; continue; }

    emit('', ch);
    i++;
  }
  return out;
}

function updateHighlight() {
  highlightEl.innerHTML = highlightCSS(cssEditor.value) + '\n';
  highlightEl.scrollTop = cssEditor.scrollTop;
  highlightEl.scrollLeft = cssEditor.scrollLeft;
}

function updateGutter() {
  const lines = cssEditor.value.split('\n').length;
  let out = '';
  for (let i = 1; i <= lines; i++) out += i + '\n';
  gutterEl.textContent = out;
  gutterEl.scrollTop = cssEditor.scrollTop;
}

function updateCssInfo() {
  cssInfo.textContent = cssEditor.value.split('\n').length + ' 行';
}

cssEditor.addEventListener('input', () => {
  const s = current();
  if (!s) return;
  s.css = cssEditor.value;
  updateGutter();
  updateHighlight();
  updateCssInfo();
  scheduleSave();
});

cssEditor.addEventListener('scroll', () => {
  gutterEl.scrollTop = cssEditor.scrollTop;
  highlightEl.scrollTop = cssEditor.scrollTop;
  highlightEl.scrollLeft = cssEditor.scrollLeft;
});

// Ctrl+/ 注释 / 取消注释：作用于选中内容，无选中时作用于当前整行
function toggleCssComment() {
  const v = cssEditor.value;
  let s = cssEditor.selectionStart;
  let e = cssEditor.selectionEnd;

  if (s === e) {
    s = v.lastIndexOf('\n', s - 1) + 1;
    e = v.indexOf('\n', s);
    if (e === -1) e = v.length;
  }

  // 末尾换行不包进注释
  let end = e;
  let trailing = '';
  while (end > s && (v[end - 1] === '\n' || v[end - 1] === '\r')) {
    trailing = v[end - 1] + trailing;
    end--;
  }

  const text = v.slice(s, end);
  if (!text.trim()) return;

  let insert;
  if (/\/\*/.test(text)) {
    // 已包含注释 → 去掉注释（支持一次取消多段 /* */），并去掉包裹时加的空格
    insert = text.replace(/\/\*[\s\S]*?\*\//g, m => {
      const inner = m.slice(2, -2);
      return (inner.startsWith(' ') && inner.endsWith(' ')) ? inner.slice(1, -1) : inner;
    }) + trailing;
    if (insert.startsWith('/*')) insert = insert.slice(2);      // 兜底：未闭合的 /*
    if (insert.endsWith('*/')) insert = insert.slice(0, -2);    // 兜底：未闭合的 */
  } else {
    insert = '/* ' + text + ' */' + trailing;
  }

  cssEditor.setRangeText(insert, s, e, 'select');
  cssEditor.dispatchEvent(new Event('input'));
}

cssEditor.addEventListener('keydown', e => {
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    cssEditor.setRangeText('  ', cssEditor.selectionStart, cssEditor.selectionEnd, 'end');
    cssEditor.dispatchEvent(new Event('input'));
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === '/') {
    e.preventDefault();
    toggleCssComment();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    flushSave();
  }
});

/* ===== 顶部按钮 ===== */
// 一键停用 / 恢复所有样式（单个样式、单条规则仍可用各自勾选框单独控制）
function updateToggleBtn() {
  const anyEnabled = styles.some(s => s.enabled);
  btnToggle.textContent = anyEnabled ? '禁用' : '启用';
  btnToggle.title = anyEnabled ? '停用所有样式' : '启用所有样式';
  btnToggle.disabled = !styles.length;
}

btnToggle.addEventListener('click', () => {
  if (!styles.length) return;
  const anyEnabled = styles.some(s => s.enabled);
  styles.forEach(s => { s.enabled = !anyEnabled; });
  renderList();
  scheduleSave();
});

$('#btn-add').addEventListener('click', () => {
  const s = {
    id: uid(),
    name: '新样式',
    enabled: true,
    rules: [{ type: 'domain', value: '', enabled: true }],
    css: '',
  };
  styles.push(s);
  selectedId = s.id;
  pendingSave = true;
  flushSave();
  renderAll();
});

/* ===== 主题：白天 / 夜间 ===== */
function applyTheme(t) {
  const dark = t === 'dark';
  document.body.classList.toggle('dark', dark);
  themeBtn.textContent = dark ? '☀️' : '🌙';
  themeBtn.title = dark ? '切换到白天模式' : '切换到夜间模式';
}

// 脚本加载时先按系统偏好应用，避免深色用户闪白；init 里再用已保存的选择覆盖
applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

themeBtn.addEventListener('click', () => {
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(next);
  store.set({ theme: next });
});

/* ===== 外部修改同步（其他标签页编辑时跟随更新） ===== */
store.onChanged.addListener(changes => {
  if (!changes.styles) return;
  const next = Array.isArray(changes.styles.newValue) ? changes.styles.newValue : [];
  if (JSON.stringify(next) === JSON.stringify(styles)) return;
  styles = next;
  if (!current()) selectedId = styles.length ? styles[0].id : null;
  const ae = document.activeElement;
  const editing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT');
  renderList();
  if (!editing) renderMeta();
});

window.addEventListener('beforeunload', flushSave);

/* ===== 启动：首次使用时放入一条示例样式 ===== */
init();
async function init() {
  const data = await store.get(['styles', 'theme']);
  if (data.theme === 'dark' || data.theme === 'light') applyTheme(data.theme);
  if (Array.isArray(data.styles)) {
    styles = data.styles;
  } else {
    styles = [EXAMPLE];
    await store.set({ styles });
  }
  selectedId = styles.length ? styles[0].id : null;
  renderAll();
}
