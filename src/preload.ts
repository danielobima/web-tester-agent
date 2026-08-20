import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  stopTest: () => {
    ipcRenderer.send('stop-test');
  },
  approvePlan: (result: any) => {
    ipcRenderer.send('approve-plan', result);
  },
  replayTest: (suitePath?: string) => {
    ipcRenderer.send('replay-test', { suitePath });
  },
  getSuite: (suitePath: string) => ipcRenderer.invoke('get-suite', suitePath),
  getSuiteReport: (suitePath: string) => ipcRenderer.invoke('get-suite-report', suitePath),
  getSuiteLog: (suitePath: string) => ipcRenderer.invoke('get-suite-log', suitePath),
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
  onExecutionFinished: (callback: (checklist: any) => void) => {
    const subscription = (event: any, checklist: any) => callback(checklist);
    ipcRenderer.on('execution-finished', subscription);
    return () => ipcRenderer.removeListener('execution-finished', subscription);
  },
  sendCompletionValidationResponse: (result: any) => {
    ipcRenderer.send('completion-validation-response', result);
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
  },
  onTestIssues: (callback: (issues: any[]) => void) => {
    const subscription = (event: any, issues: any[]) => callback(issues);
    ipcRenderer.on('test-issues', subscription);
    return () => ipcRenderer.removeListener('test-issues', subscription);
  },
  
  // Application Management
  listApplications: () => ipcRenderer.invoke('list-applications'),
  createApplication: (name: string, description?: string) => ipcRenderer.invoke('create-application', { name, description }),
  deleteApplication: (appId: string) => ipcRenderer.invoke('delete-application', appId),

  // Test Management
  listTests: (appId?: string) => ipcRenderer.invoke('list-tests', appId),
  createTest: (config: { appId: string, name: string, url: string, requirement: string, model: string }) => ipcRenderer.invoke('create-test', config),
  updateTest: (testId: string, config: any) => ipcRenderer.invoke('update-test', { testId, config }),
  deleteTest: (testId: string) => ipcRenderer.invoke('delete-test', testId),
  getTest: (testId: string) => ipcRenderer.invoke('get-test', testId),
  
  // Agent Error Management
  listAgentErrors: () => ipcRenderer.invoke('list-agent-errors'),
  getAgentError: (errorId: string) => ipcRenderer.invoke('get-agent-error', errorId),
  deleteAgentError: (errorId: string) => ipcRenderer.invoke('delete-agent-error', errorId),

  // Configuration
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config: any) => ipcRenderer.invoke("save-config", config),

  // Variables Management
  listVariables: (appId?: string) => ipcRenderer.invoke("list-variables", appId),
  createVariable: (config: { appId: string, name: string, type: string, value: string, purpose: string, expiry?: string }) => ipcRenderer.invoke("create-variable", config),
  updateVariable: (varId: string, config: any) => ipcRenderer.invoke("update-variable", { varId, config }),
  deleteVariable: (varId: string) => ipcRenderer.invoke("delete-variable", varId),

  // Auth Profile Management
  listAuthProfiles: (appId?: string) => ipcRenderer.invoke("list-auth-profiles", appId),
  getAuthProfileDetails: (profileId: string) => ipcRenderer.invoke("get-auth-profile-details", profileId),
  createAuthProfile: (config: { appId: string, name: string, description?: string, expiry?: string, sourceTestId?: string }) => ipcRenderer.invoke("create-auth-profile", config),
  updateAuthProfile: (profileId: string, config: any) => ipcRenderer.invoke("update-auth-profile", { profileId, config }),
  deleteAuthProfile: (profileId: string) => ipcRenderer.invoke("delete-auth-profile", profileId),

  // Precondition Status
  onPreconditionStatus: (callback: (status: any) => void) => {
    const subscription = (event: any, status: any) => callback(status);
    ipcRenderer.on('test-precondition-status', subscription);
    return () => ipcRenderer.removeListener('test-precondition-status', subscription);
  },

  startTest: (url: string, requirement: string, testId?: string, model?: string) => {
    ipcRenderer.send('start-test', { url, requirement, testId, model });
  }
});
