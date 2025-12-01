import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import {
  getDefaultRole,
  isGeographicFileType,
  isTabularFileType,
  type DataRole,
  type DataRoleAssignment,
  type DataTypeSelectionState
} from './types';

const DEFAULT_STATE: DataTypeSelectionState = {
  assignments: [],
  confirmed: false
};

class DataTypeSelectionStore {
  private _state = $state<DataTypeSelectionState>({ ...DEFAULT_STATE });

  get assignments() {
    return this._state.assignments;
  }

  get confirmed() {
    return this._state.confirmed;
  }

  get tabularFiles() {
    return this._state.assignments.filter((a) => a.assignedRole === 'tabular');
  }

  get geographicFiles() {
    return this._state.assignments.filter(
      (a) => a.assignedRole === 'geographic'
    );
  }

  get isValid() {
    return (
      this._state.assignments.length > 0 &&
      this._state.assignments.every((a) => a.assignedRole !== undefined)
    );
  }

  initializeFromFiles(files: UploadedFile[]): void {
    this._state.assignments = files
      .filter((f) => f.status === 'complete')
      .map((file) => ({
        fileId: file.id,
        fileName: file.name,
        fileType: file.fileType,
        assignedRole: getDefaultRole(file.fileType)
      }));
    this._state.confirmed = false;
  }

  setRole(fileId: string, role: DataRole): void {
    const assignment = this._state.assignments.find(
      (a) => a.fileId === fileId
    );
    if (assignment) {
      assignment.assignedRole = role;
    }
  }

  confirm(): void {
    this._state.confirmed = true;
  }

  reset(): void {
    this._state.assignments = [];
    this._state.confirmed = false;
  }

  shouldShowModal(files: UploadedFile[]): boolean {
    const completeFiles = files.filter((f) => f.status === 'complete');
    if (completeFiles.length < 2) return false;

    const hasTabular = completeFiles.some((f) => isTabularFileType(f.fileType));
    const hasGeographic = completeFiles.some((f) =>
      isGeographicFileType(f.fileType)
    );

    return hasTabular && hasGeographic;
  }
}

export const dataTypeSelectionStore = new DataTypeSelectionStore();

export const dataTypeSelectionActions = {
  initializeFromFiles:
    dataTypeSelectionStore.initializeFromFiles.bind(dataTypeSelectionStore),
  setRole: dataTypeSelectionStore.setRole.bind(dataTypeSelectionStore),
  confirm: dataTypeSelectionStore.confirm.bind(dataTypeSelectionStore),
  reset: dataTypeSelectionStore.reset.bind(dataTypeSelectionStore),
  shouldShowModal:
    dataTypeSelectionStore.shouldShowModal.bind(dataTypeSelectionStore)
};
