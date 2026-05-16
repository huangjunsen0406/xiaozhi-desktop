import type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  AppStateSnapshot,
  DeviceInfo,
  IpcResult,
} from '@shared/types'
import type { ServiceContainer } from '../core/ServiceContainer'

export interface IpcContext {
  container: ServiceContainer
}

export type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  AppStateSnapshot,
  DeviceInfo,
  IpcResult,
}
