// 点击工具栏图标时，在新标签页打开管理页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'manager.html' });
});
