// 内容脚本：读取样式配置，把命中当前页面的 CSS 注入进去
// 存储变化时实时重新注入，页面无需刷新
(() => {
  'use strict';

  const ATTR = 'data-simplestyle';

  function ruleHit(rule, url, hostname) {
    const v = (rule.value || '').trim();
    if (!v && rule.type !== 'all') return false;
    switch (rule.type) {
      case 'all':    return true;
      case 'url':    return url === v;
      case 'prefix': return url.startsWith(v);
      case 'domain': return hostname === v || hostname.endsWith('.' + v);
      case 'regex':
        try { return new RegExp(v).test(url); } catch (e) { return false; }
    }
    return false;
  }

  function apply(data) {
    const styles = (data && Array.isArray(data.styles)) ? data.styles : [];
    document.querySelectorAll('style[' + ATTR + ']').forEach(el => el.remove());
    if (!styles.length) return;

    const url = location.href;
    const hostname = location.hostname;
    const cssList = [];
    for (const s of styles) {
      if (!s || s.enabled === false) continue;
      if (!Array.isArray(s.rules) || !s.rules.length || !s.css) continue;
      if (s.rules.some(r => r.enabled !== false && ruleHit(r, url, hostname))) {
        cssList.push('/* ' + (s.name || '未命名') + ' */\n' + s.css);
      }
    }
    if (!cssList.length) return;

    const root = document.head || document.documentElement;
    if (!root) return;
    const style = document.createElement('style');
    style.setAttribute(ATTR, '');
    style.textContent = cssList.join('\n\n');
    root.appendChild(style);
  }

  chrome.storage.onChanged.addListener(changes => {
    if (changes.styles) apply({ styles: changes.styles.newValue });
  });

  chrome.storage.local.get('styles', apply);
})();
