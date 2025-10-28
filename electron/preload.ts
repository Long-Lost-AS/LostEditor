const { contextBridge, ipcRenderer } = require('electron')

console.log('Preload script running!')

contextBridge.exposeInMainWorld('electron', {
  // Menu event listeners - remove all existing listeners before adding new ones
  onMenuNewProject: (callback) => {
    ipcRenderer.removeAllListeners('menu:new-project')
    ipcRenderer.on('menu:new-project', callback)
  },
  onMenuOpenProject: (callback) => {
    ipcRenderer.removeAllListeners('menu:open-project')
    ipcRenderer.on('menu:open-project', callback)
  },
  onMenuSaveProject: (callback) => {
    ipcRenderer.removeAllListeners('menu:save-project')
    ipcRenderer.on('menu:save-project', callback)
  },
  onMenuSaveProjectAs: (callback) => {
    ipcRenderer.removeAllListeners('menu:save-project-as')
    ipcRenderer.on('menu:save-project-as', callback)
  },
  onAutoLoadProject: (callback) => {
    ipcRenderer.removeAllListeners('auto-load-project')
    ipcRenderer.removeAllListeners('menu:load-recent-project')
    ipcRenderer.on('auto-load-project', callback)
    ipcRenderer.on('menu:load-recent-project', callback)
  },
  onMenuLoadTileset: (callback) => {
    ipcRenderer.removeAllListeners('menu:load-tileset')
    ipcRenderer.on('menu:load-tileset', callback)
  },
  onMenuNewTileset: (callback) => {
    ipcRenderer.removeAllListeners('menu:new-tileset')
    ipcRenderer.on('menu:new-tileset', callback)
  },

  // File operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),

  // Settings
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settingsJson) => ipcRenderer.invoke('save-settings', settingsJson),

  // Dialogs
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // Menu
  rebuildMenu: () => ipcRenderer.send('rebuild-menu')
})

console.log('Electron API exposed to window.electron')
