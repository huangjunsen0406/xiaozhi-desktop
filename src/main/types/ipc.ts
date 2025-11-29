import type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  AppStateSnapshotRaw,
  DeviceInfo,
  IpcResult,
} from '@shared/types'
import type { Application } from '../services/Application'

export interface IpcContext {
  application: Application
}

export type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  AppStateSnapshotRaw as AppStateSnapshot,
  DeviceInfo,
  IpcResult,
}
