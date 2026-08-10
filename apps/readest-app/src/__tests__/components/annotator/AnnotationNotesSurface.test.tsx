import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

const mocks = vi.hoisted(() => ({
  envConfig: {},
  settings: {},
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  saveConfig: vi.fn(),
  updateBooknotes: vi.fn(),
  addAnnotation: vi.fn(),
  getViewsById: vi.fn(),
  setHoveredBookKey: vi.fn(),
  setSideBarVisible: vi.fn(),
  onDismiss: vi.fn(),
}));

/**
 * The note cards shown when tapping an annotation are `.popup-container`s, so
 * they should wear the same chrome as every other popup (Popup.tsx): a
 * `base-300` surface that flips to `base-100` on dark themes, `base-content`
 * text, and a hairline border.
 *
 * They used to hardcode `bg-gray-600` + `text-white` instead, which left a dark
 * slate card hanging off the popup's tan `base-300` triangle on light themes,
 * and forced `eink:` overrides on every text node to stay legible.
 */

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isMobile: false }, envConfig: mocks.envConfig }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: mocks.getConfig,
    setConfig: mocks.setConfig,
    saveConfig: mocks.saveConfig,
    updateBooknotes: mocks.updateBooknotes,
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getViewsById: mocks.getViewsById,
    setHoveredBookKey: mocks.setHoveredBookKey,
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({ setSideBarVisible: mocks.setSideBarVisible }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: mocks.settings }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (n: number) => n,
}));

import AnnotationNotes from '@/app/reader/components/annotator/AnnotationNotes';

dayjs.extend(relativeTime);

beforeEach(() => {
  vi.clearAllMocks();
  let config = {
    viewSettings: {},
    booknotes: [
      {
        id: 'n1',
        type: 'annotation',
        cfi: 'epubcfi(/6/2!/4/1:0)',
        note: 'Gryphon',
        text: 'Gryphon',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  mocks.getConfig.mockImplementation(() => config);
  mocks.updateBooknotes.mockImplementation((_bookKey, booknotes) => {
    config = { ...config, booknotes };
    return config;
  });
  mocks.getViewsById.mockReturnValue([{ addAnnotation: mocks.addAnnotation }]);
});

afterEach(() => {
  cleanup();
});

const renderNotes = () =>
  render(
    <AnnotationNotes
      bookKey='test'
      isVertical={false}
      notes={[
        {
          id: 'n1',
          type: 'annotation',
          cfi: 'epubcfi(/6/2!/4/1:0)',
          note: 'Gryphon',
          text: 'Gryphon',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]}
      toolsVisible={false}
      triangleDir='up'
      popupWidth={240}
      popupHeight={120}
      onDismiss={mocks.onDismiss}
    />,
  );

describe('AnnotationNotes popup surface', () => {
  it('paints the note card with the shared popup surface, not a hardcoded gray', () => {
    const { container } = renderNotes();

    const card = container.querySelector('.popup-container') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.className).not.toMatch(/bg-gray-/);
    expect(card.className).toContain('bg-base-300');
    expect(card.className).toContain('theme-dark:bg-base-100');
  });

  it('uses base-content text so no eink-only color override is needed', () => {
    const { container } = renderNotes();

    expect(container.querySelector('[class*="text-white"]')).toBeNull();
  });

  it('edits and persists a note without opening the annotations sidebar', () => {
    renderNotes();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    let editor = screen.getByRole('textbox', { name: 'Note' });
    expect((editor as HTMLTextAreaElement).value).toBe('Gryphon');

    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: 'Mock Turtle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.updateBooknotes).toHaveBeenCalledWith('test', [
      expect.objectContaining({ id: 'n1', note: 'Mock Turtle' }),
    ]);
    expect(mocks.saveConfig).toHaveBeenCalledWith(
      mocks.envConfig,
      'test',
      expect.objectContaining({
        booknotes: [expect.objectContaining({ id: 'n1', note: 'Mock Turtle' })],
      }),
      mocks.settings,
    );
    expect(mocks.setSideBarVisible).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Mock Turtle')).not.toBeNull();
    expect(screen.queryByText('Gryphon')).toBeNull();
  });

  it('clears a note and removes its reader bubble', () => {
    renderNotes();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(editor, { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

    expect(mocks.updateBooknotes).toHaveBeenCalledWith('test', [
      expect.objectContaining({ id: 'n1', note: '' }),
    ]);
    expect(mocks.addAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', note: '' }),
      true,
    );
    expect(mocks.saveConfig).toHaveBeenCalledOnce();
    expect(mocks.onDismiss).toHaveBeenCalledOnce();
  });
});
