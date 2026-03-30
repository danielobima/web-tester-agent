import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  startTest: (url: string, prompt: string) => {
    ipcRenderer.send('start-test', { url, prompt });
  },
  stopTest: () => {
    ipcRenderer.send('stop-test');
  },
  onTestStep: (callback: (step: any) => void) => {
    const subscription = (event: any, step: any) => callback(step);
    ipcRenderer.on('test-step', subscription);
    return () => ipcRenderer.removeListener('test-step', subscription);
  },
  onTestChecklist: (callback: (checklist: any) => void) => {
    const subscription = (event: any, checklist: any) => callback(checklist);
    ipcRenderer.on('test-checklist', subscription);
    return () => ipcRenderer.removeListener('test-checklist', subscription);
  },
  onTestComplete: (callback: (result: any) => void) => {
    const subscription = (event: any, result: any) => callback(result);
    ipcRenderer.on('test-complete', subscription);
    return () => ipcRenderer.removeListener('test-complete', subscription);
  }
});
