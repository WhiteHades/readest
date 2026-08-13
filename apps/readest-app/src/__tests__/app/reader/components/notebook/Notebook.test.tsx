import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Notebook from '@/app/reader/components/notebook/Notebook';
import { useNotebookStore } from '@/store/notebookStore';
import { BookNote } from '@/types/book';
import { TextSelection } from '@/utils/sel';

const mocks = vi.hoisted(() => ({
  bookKey: 'book-primary',
  config: { booknotes: [] as BookNote[] },
  selection: null as TextSelection | null,
  editedNote: null as BookNote | null,
  page: 7,
  addAnnotation: vi.fn(),
  saveConfig: vi.fn(),
  updateBooknotes: vi.fn(),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { hasRoundedWindow: false } }),
}));

vi.mock('@/store/settingsStore', () => {
  const settings = {
    globalReadSettings: {
      notebookWidth: '30%',
      isNotebookPinned: true,
      notebookActiveTab: 'notes',
      highlightStyle: 'highlight',
      highlightStyles: { highlight: 'yellow' },
    },
  };
  const useSettingsStore = () => ({ settings });
  useSettingsStore.getState = () => ({ settings });
  return { useSettingsStore };
});

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ bookDoc: { metadata: { language: 'en' } } }),
    getConfig: () => mocks.config,
    saveConfig: mocks.saveConfig,
    updateBooknotes: mocks.updateBooknotes,
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => ({ getCFI: () => 'epubcfi(/6/2)', addAnnotation: mocks.addAnnotation }),
    getViewsById: () => [],
    getProgress: () => ({ page: mocks.page }),
    getViewSettings: () => ({}),
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({ sideBarBookKey: mocks.bookKey }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    updateAppTheme: vi.fn(),
    safeAreaInsets: { bottom: 0 },
    systemUIVisible: false,
    statusBarHeight: 0,
  }),
}));

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: () => ({ activeConversationId: null }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useSwipeToDismiss', () => ({
  useSwipeToDismiss: () => ({
    panelRef: { current: null },
    overlayRef: { current: null },
    panelHeight: { current: 0 },
    handleVerticalDragStart: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePanelResize', () => ({
  usePanelResize: () => ({ handleResizeStart: vi.fn(), handleResizeKeyDown: vi.fn() }),
}));

vi.mock('@/hooks/useShortcuts', () => ({ default: vi.fn() }));
vi.mock('@/utils/insets', () => ({ getPanelTopInset: () => 0 }));
vi.mock('@/utils/event', () => ({
  eventDispatcher: { on: vi.fn(), off: vi.fn(), dispatch: vi.fn() },
}));
vi.mock('@/helpers/settings', () => ({ saveSysSettings: vi.fn() }));
vi.mock('@/components/Overlay', () => ({ Overlay: () => <div data-testid='overlay' /> }));
vi.mock('@/app/reader/components/notebook/AIAssistant', () => ({ default: () => null }));
vi.mock('@/app/reader/components/notebook/Header', () => ({ default: () => null }));
vi.mock('@/app/reader/components/notebook/SearchBar', () => ({ default: () => null }));
vi.mock('@/app/reader/components/notebook/NotebookTabNavigation', () => ({
  default: () => null,
}));
vi.mock('@/app/reader/components/EmptyState', () => ({ default: () => null }));
vi.mock('@/app/reader/components/notebook/NoteEditor', () => ({
  default: ({
    onSave,
    onEdit,
  }: {
    onSave: (selection: TextSelection, note: string) => void;
    onEdit: (note: BookNote) => void;
  }) => (
    <div data-testid='note-editor'>
      <button onClick={() => onSave(mocks.selection!, 'Saved note')}>Save new</button>
      <button onClick={() => onEdit(mocks.editedNote!)}>Save edit</button>
    </div>
  ),
}));

const makeNote = (overrides: Partial<BookNote> = {}): BookNote => ({
  id: 'note-1',
  type: 'annotation',
  cfi: 'epubcfi(/6/2)',
  text: 'Selected text',
  style: 'highlight',
  color: 'yellow',
  note: 'Old note',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bookKey = 'book-primary';
  mocks.config = { booknotes: [] };
  mocks.selection = {
    key: 'selection-1',
    text: 'Selected text',
    page: 1,
    range: new Range(),
    index: 0,
  };
  mocks.editedNote = null;
  mocks.updateBooknotes.mockImplementation((_bookKey, booknotes: BookNote[]) => {
    mocks.config = { booknotes: [...booknotes] };
    return mocks.config;
  });
  useNotebookStore.setState({
    notebookWidth: '30%',
    isNotebookVisible: true,
    isNotebookPinned: true,
    notebookActiveTab: 'notes',
    notebookNewAnnotation: null,
    notebookNewHighlightId: null,
    notebookEditAnnotation: null,
    notebookAnnotationDrafts: {},
  });
});

afterEach(cleanup);

describe('Notebook annotation editor', () => {
  it('keeps a newly saved note open as the edit target', () => {
    useNotebookStore.setState({
      notebookNewAnnotation: mocks.selection,
      notebookNewHighlightId: 'placeholder-1',
    });
    render(<Notebook />);

    fireEvent.click(screen.getByRole('button', { name: 'Save new' }));

    expect(screen.getByTestId('note-editor')).not.toBeNull();
    expect(useNotebookStore.getState().notebookNewAnnotation).toBeNull();
    expect(useNotebookStore.getState().notebookEditAnnotation).toEqual(
      expect.objectContaining({ note: 'Saved note', text: 'Selected text' }),
    );
    expect(useNotebookStore.getState().notebookNewHighlightId).toBeNull();
  });

  it('merges an edit into the current record instead of a stale editor snapshot', () => {
    const current = makeNote({ style: 'underline', color: 'red', global: true, updatedAt: 2000 });
    const stale = makeNote();
    mocks.config = { booknotes: [current] };
    mocks.editedNote = { ...stale, note: 'Edited note' };
    render(<Notebook />);
    act(() => useNotebookStore.getState().setNotebookEditAnnotation(stale));

    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

    expect(mocks.config.booknotes[0]).toEqual(
      expect.objectContaining({
        id: current.id,
        note: 'Edited note',
        style: 'underline',
        color: 'red',
        global: true,
        page: mocks.page,
      }),
    );
    expect(useNotebookStore.getState().notebookEditAnnotation).toEqual(mocks.config.booknotes[0]);
  });

  it('closes the editor when the active annotation is deleted elsewhere', async () => {
    const note = makeNote();
    mocks.config = { booknotes: [note] };
    const view = render(<Notebook />);
    act(() => useNotebookStore.getState().setNotebookEditAnnotation(note));
    expect(screen.getByTestId('note-editor')).not.toBeNull();

    mocks.config = { booknotes: [{ ...note, deletedAt: 2000 }] };
    view.rerender(<Notebook />);

    await waitFor(() => expect(useNotebookStore.getState().notebookEditAnnotation).toBeNull());
    expect(screen.queryByTestId('note-editor')).toBeNull();
  });

  it('closes the editor when switching books even if the next book has the same note id', async () => {
    const note = makeNote();
    mocks.config = { booknotes: [note] };
    const view = render(<Notebook />);
    act(() => useNotebookStore.getState().setNotebookEditAnnotation(note));

    mocks.bookKey = 'other-book-primary';
    mocks.config = { booknotes: [{ ...note, note: 'Other book note' }] };
    view.rerender(<Notebook />);

    await waitFor(() => expect(useNotebookStore.getState().notebookEditAnnotation).toBeNull());
  });

  it('keeps the annotation editor open when deleting an excerpt', () => {
    const note = makeNote();
    const excerpt = makeNote({ id: 'excerpt-1', type: 'excerpt', note: '', text: 'Excerpt' });
    mocks.config = { booknotes: [note, excerpt] };
    render(<Notebook />);
    act(() => useNotebookStore.getState().setNotebookEditAnnotation(note));

    fireEvent.click(screen.getByLabelText('Delete'));

    expect(useNotebookStore.getState().notebookEditAnnotation).toEqual(note);
    expect(screen.getByTestId('note-editor')).not.toBeNull();
  });
});
