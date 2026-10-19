const { contextBridge, ipcRenderer } = require('electron');

const send = (ch, ...a) => ipcRenderer.send(ch, ...a);
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('lumen', {
  platform: process.platform,
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onFocusUrl: (cb) => ipcRenderer.on('focus-url', () => cb()),
  ready: () => send('ui:ready'),
  newTab: () => send('tab:new'),
  activate: (id) => send('tab:activate', id),
  close: (id) => send('tab:close', id),
  sleep: (id) => send('tab:sleep', id),
  go: (text) => send('nav:go', text),
  nav: (action) => send('nav:action', action),
  panel: (width) => send('panel:width', width),
  setSettings: (patch) => call('settings:set', patch),
  bookmarks: () => call('bm:list'),
  toggleBookmark: () => call('bm:toggle'),
  removeBookmark: (url) => send('bm:remove', url),
  history: () => call('hist:list'),
  clearHistory: () => send('hist:clear'),
  metrics: () => call('tabs:metrics'),
  blocked: () => call('adblock:stats'),
});
