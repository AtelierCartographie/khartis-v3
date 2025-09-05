export type ProjectTab = 1 | 2 | 3;

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string | ArrayBuffer;
  status: 'uploading' | 'complete' | 'edit' | 'error';
  errorMessage?: string;
}

export interface SavedProject {
  id: string;
  title: string;
  subtitle: string;
  createdAt: Date;
  thumbnail?: string;
}

export interface ExampleProject {
  id: string;
  title: string;
  subtitle: string;
  category: ExampleCategory;
  thumbnail?: string;
  dataUrl?: string;
}

export type ExampleCategory =
  | 'all'
  | 'symbols'
  | 'polygons'
  | 'lines'
  | 'texts'
  | 'hybrids';

export interface CreateProjectState {
  isModalOpen: boolean;

  selectedTab: ProjectTab;

  newProject: {
    uploadedFiles: UploadedFile[];
    pastedData: string;
    onlineFileUrl: string;
    projectName: string;
    isLoading: boolean;
    error?: string;
  };

  openProject: {
    savedProjects: SavedProject[];
    selectedProjectId?: string;
    importedFile?: UploadedFile;
    isLoading: boolean;
    error?: string;
  };

  tryExample: {
    examples: ExampleProject[];
    selectedExampleId?: string;
    selectedCategory: ExampleCategory;
    isLoading: boolean;
    error?: string;
  };
}
