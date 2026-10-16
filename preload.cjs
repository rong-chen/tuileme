const { contextBridge, ipcRenderer } = require('electron')

function toPlain(obj) {
  if (obj === undefined || obj === null) return obj
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (e) {
    return obj
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  getAIConfig: () => ipcRenderer.invoke('get-ai-config'),
  saveAIConfig: (cfg) => ipcRenderer.invoke('save-ai-config', toPlain(cfg)),
  testAIConnection: (cfg) => ipcRenderer.invoke('test-ai-connection', toPlain(cfg)),
  fetchAIModels: (cfg) => ipcRenderer.invoke('fetch-ai-models', toPlain(cfg)),
  getTargetSites: () => ipcRenderer.invoke('get-target-sites'),
  saveTargetSites: (sites) => ipcRenderer.invoke('save-target-sites', toPlain(sites)),
  generatePromoteContent: (form) => ipcRenderer.invoke('generate-promote-content', toPlain(form)),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  copyImageToClipboard: (imgSource) => ipcRenderer.invoke('copy-image-to-clipboard', imgSource),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getCurrentDraft: () => ipcRenderer.invoke('get-current-draft'),
  saveCurrentDraft: (draft) => ipcRenderer.invoke('save-current-draft', toPlain(draft)),
  saveDraftRecord: (record) => ipcRenderer.invoke('save-draft-record', toPlain(record)),
  getDraftRecords: () => ipcRenderer.invoke('get-draft-records'),
  deleteDraftRecord: (id) => ipcRenderer.invoke('delete-draft-record', id),
  clearSessionStorage: (targetUrl) => ipcRenderer.invoke('clear-session-storage', targetUrl),
  onOpenNewTab: (callback) => ipcRenderer.on('open-new-tab', (event, url) => callback(url)),
  injectImagesViaCDP: (params) => ipcRenderer.invoke('inject-images-via-cdp', toPlain(params))
})

