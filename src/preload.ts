import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  startTest: (url: string, prompt: string) => {
    ipcRenderer.send('start-test', { url, prompt });
  },
  stopTest: () => {
    ipcRenderer.send('stop-test');
  },
  approvePlan: (result: any) => {
    ipcRenderer.send('approve-plan', result);
  },
  replayTest: (suitePath?: string) => {
    ipcRenderer.send('replay-test', { suitePath });
  },
  listSuites: () => ipcRenderer.invoke('list-suites'),
  getSuite: (suitePath: string) => ipcRenderer.invoke('get-suite', suitePath),
  getSuiteReport: (suitePath: string) => ipcRenderer.invoke('get-suite-report', suitePath),
  deleteSuite: (suitePath: string) => ipcRenderer.invoke('delete-suite', suitePath),
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
  onPlanApprovalRequest: (callback: (checklist: any) => void) => {
    const subscription = (event: any, checklist: any) => callback(checklist);
    ipcRenderer.on('plan-approval-request', subscription);
    return () => ipcRenderer.removeListener('plan-approval-request', subscription);
  },
  onGoalReached: (callback: (checklist: any) => void) => {
    const subscription = (event: any, checklist: any) => callback(checklist);
    ipcRenderer.on('goal-reached', subscription);
    return () => ipcRenderer.removeListener('goal-reached', subscription);
  },
  sendGoalValidationResponse: (result: any) => {
    ipcRenderer.send('goal-validation-response', result);
  },
  pauseTest: () => {
    ipcRenderer.send('pause-test');
  },
  resumeTest: (result: any) => {
    ipcRenderer.send('resume-test', result);
  },
  onPauseRequest: (callback: (checklist: any) => void) => {
    const subscription = (event: any, checklist: any) => callback(checklist);
    ipcRenderer.on('pause-request', subscription);
    return () => ipcRenderer.removeListener('pause-request', subscription);
  },
  onTestComplete: (callback: (result: any) => void) => {
    const subscription = (event: any, result: any) => callback(result);
    ipcRenderer.on('test-complete', subscription);
    return () => ipcRenderer.removeListener('test-complete', subscription);
  },
  onPlanningState: (callback: (isPlanning: boolean) => void) => {
    const subscription = (event: any, isPlanning: boolean) => callback(isPlanning);
    ipcRenderer.on('test-planning-state', subscription);
    return () => ipcRenderer.removeListener('test-planning-state', subscription);
  }
});
