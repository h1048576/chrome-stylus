// 点击工具栏图标时，在新标签页打开管理页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'manager.html' });
});

// 扩展安装 / 更新 / 重载后，把内容脚本补注入到所有已打开的标签页，
// 让已经打开的页面无需手动刷新即可生效（对齐官方 Stylus 的行为）
async function injectAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !/^https?:/.test(tab.url)) continue;
    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js'],
    }).catch(() => {}); // chrome:// 等受限页面会失败，静默跳过
  }
}

chrome.runtime.onInstalled.addListener(injectAllTabs);
chrome.runtime.onStartup.addListener(injectAllTabs);
