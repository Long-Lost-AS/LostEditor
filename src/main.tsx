import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

// Declare electron API type
declare global {
  interface Window {
    electron?: {
      onMenuNewProject: (callback: () => void) => void
      onMenuOpenProject: (callback: () => void) => void
      onMenuSaveProject: (callback: () => void) => void
      onMenuSaveProjectAs: (callback: () => void) => void
      onAutoLoadProject: (callback: (event: any, filePath: string) => void) => void
      readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
      writeFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>
      loadSettings: () => Promise<{ success: boolean; data?: string; error?: string }>
      saveSettings: (settingsJson: string) => Promise<{ success: boolean; error?: string }>
      showOpenDialog: (options: any) => Promise<{ filePaths?: string[] }>
      showSaveDialog: (options: any) => Promise<{ filePath?: string }>
      rebuildMenu: () => void
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
