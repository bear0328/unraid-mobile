import { UnraidApiService } from './unraidApi';
import { ContainerAction, VmAction } from './actionTypes';

export async function runContainerAction(
  api: UnraidApiService,
  id: string,
  action: ContainerAction
): Promise<{ success: boolean; error?: string }> {
  switch (action) {
    case 'start':
      return api.startContainer(id);
    case 'stop':
      return api.stopContainer(id);
    case 'restart':
      return api.restartContainer(id);
    case 'pause':
      return api.pauseContainer(id);
    case 'resume':
      return api.resumeContainer(id);
  }
}

export async function runVmAction(
  api: UnraidApiService,
  id: string,
  action: VmAction
): Promise<{ success: boolean; error?: string }> {
  switch (action) {
    case 'start':
      return api.startVm(id);
    case 'stop':
      return api.stopVm(id);
    case 'pause':
      return api.pauseVm(id);
    case 'resume':
      return api.resumeVm(id);
    case 'reboot':
      return api.rebootVm(id);
  }
}
