import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DuplicateProjectModal from './duplicate-project-modal.svelte';
import { projectsStore } from '../stores/projects.store.svelte';
import type { SavedProjectMetadata } from '$lib/features/project-management/types';
import { m } from '$lib/paraglide/messages';

const mocks = vi.hoisted(() => ({
  currentProject: undefined as { id: string } | undefined,
  duplicateProjectMock: vi.fn(),
  listMetadataMock: vi.fn(),
  loadProjectMock: vi.fn(),
  loadMock: vi.fn(),
  saveMock: vi.fn()
}));

vi.mock('$lib/features/project-management', () => ({
  projectRepository: {
    listMetadata: mocks.listMetadataMock,
    load: mocks.loadMock,
    save: mocks.saveMock
  }
}));

vi.mock('$lib/features/commons/stores/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    },
    duplicateProject: mocks.duplicateProjectMock,
    loadProject: mocks.loadProjectMock
  }
}));

function createMetadata(id: string, name: string): SavedProjectMetadata {
  return {
    id,
    name,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    size: 1024
  };
}

describe('DuplicateProjectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentProject = undefined;
    mocks.listMetadataMock.mockResolvedValue([]);
  });

  it('keeps the typed duplicate name when projects refresh while open', async () => {
    const sourceProject = createMetadata('project-1', 'Source project');
    mocks.currentProject = { id: sourceProject.id };
    mocks.listMetadataMock.mockResolvedValue([sourceProject]);

    render(DuplicateProjectModal, {
      open: true,
      onClose: vi.fn(),
      onConfirm: vi.fn()
    });

    const nameInput = await screen.findByLabelText(
      m.duplicate_project_modal_new_name()
    );

    await waitFor(() => {
      expect(nameInput).toHaveValue(`${sourceProject.name}${m.copy_suffix()}`);
    });

    await fireEvent.input(nameInput, {
      target: { value: 'Custom duplicate name' }
    });

    mocks.listMetadataMock.mockResolvedValue([
      sourceProject,
      createMetadata('project-2', 'Later project')
    ]);
    await projectsStore.refresh();
    await tick();

    expect(nameInput).toHaveValue('Custom duplicate name');
  });
});
