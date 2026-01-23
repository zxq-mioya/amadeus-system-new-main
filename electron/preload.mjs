
import { contextBridge, ipcRenderer } from 'electron';

// 这里可以安全地暴露主进程能力给渲染进程（前端页面）
contextBridge.exposeInMainWorld('electron', {
  // 更新相关API - 仅保留检查更新功能
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates')
});
