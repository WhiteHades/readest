import clsx from 'clsx';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MdEdit } from 'react-icons/md';
import { BookNote } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useTranslation } from '@/hooks/useTranslation';
import TextEditor from '@/components/TextEditor';
import {
  applyNoteBubbleTransition,
  decideNoteBubbleTransition,
} from '@/app/reader/utils/annotatorUtil';

interface AnnotationNotesProps {
  bookKey: string;
  isVertical: boolean;
  notes: BookNote[];
  toolsVisible: boolean;
  triangleDir: 'up' | 'down' | 'left' | 'right';
  popupWidth: number;
  popupHeight: number;
  onDismiss: () => void;
}

const AnnotationNotes: React.FC<AnnotationNotesProps> = ({
  bookKey,
  isVertical,
  notes,
  toolsVisible,
  triangleDir,
  popupWidth,
  popupHeight,
  onDismiss,
}) => {
  const _ = useTranslation();
  const { appService, envConfig } = useEnv();
  const { settings } = useSettingsStore();
  const { getConfig, saveConfig, setConfig, updateBooknotes } = useBookDataStore();
  const { getViewsById, setHoveredBookKey } = useReaderStore();
  const { setSideBarVisible } = useSidebarStore();
  const config = getConfig(bookKey);
  const maxSize = useResponsiveSize(250);
  const editIconSize = useResponsiveSize(18);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState('');
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterEditRef = useRef<string | null>(null);

  const sortedNotes = useMemo(() => {
    const liveNotes = new Map((config?.booknotes ?? []).map((note) => [note.id, note]));
    return notes
      .map((note) => (note.id ? (liveNotes.get(note.id) ?? note) : note))
      .filter((note) => !note.deletedAt && note.note.trim())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [config?.booknotes, notes]);

  useEffect(() => {
    const noteId = focusAfterEditRef.current;
    if (editingNoteId || !noteId) return;
    focusAfterEditRef.current = null;
    editButtonRefs.current.get(noteId)?.focus();
  }, [editingNoteId]);

  const handleShowAnnotation = (note: BookNote) => {
    if (!note.id) return;

    if (appService?.isMobile) {
      onDismiss();
    }

    setHoveredBookKey('');
    setSideBarVisible(true);
    if (config?.viewSettings) {
      setConfig(bookKey, {
        viewSettings: { ...config.viewSettings, sideBarTab: 'annotations' },
      });
    }
  };

  const handleEdit = (event: React.MouseEvent, note: BookNote) => {
    event.stopPropagation();
    if (!note.id) return;
    setEditorDraft(note.note);
    setEditingNoteId(note.id);
  };

  const handleCancel = () => {
    if (editingNoteId) focusAfterEditRef.current = editingNoteId;
    setEditingNoteId(null);
  };

  const handleSave = () => {
    if (!editingNoteId) return;

    const latestConfig = getConfig(bookKey);
    if (!latestConfig) return;
    const booknotes = [...(latestConfig.booknotes ?? [])];
    const existingIndex = booknotes.findIndex(
      (annotation) => annotation.id === editingNoteId && !annotation.deletedAt,
    );
    if (existingIndex === -1) return;

    const existing = booknotes[existingIndex]!;
    const nextNote = editorDraft.trim() ? editorDraft : '';
    const transition = decideNoteBubbleTransition(existing.note, nextNote);
    const updated: BookNote = { ...existing, note: nextNote, updatedAt: Date.now() };
    booknotes[existingIndex] = updated;
    const updatedConfig = updateBooknotes(bookKey, booknotes);
    if (updatedConfig) {
      applyNoteBubbleTransition(getViewsById(bookKey.split('-')[0]!), updated, transition);
      if (transition === 'remove') {
        setEditingNoteId(null);
        onDismiss();
      } else {
        handleCancel();
      }
      void saveConfig(envConfig, bookKey, updatedConfig, settings);
    }
  };

  return (
    <div
      className={clsx('annotation-notes text-base-content absolute flex rounded-lg')}
      style={{
        ...(isVertical
          ? {
              right: triangleDir === 'left' ? `${toolsVisible ? popupWidth + 16 : 0}px` : undefined,
              left: triangleDir === 'right' ? `${toolsVisible ? popupWidth + 16 : 0}px` : undefined,
              height: `${popupHeight}px`,
              maxWidth: `${maxSize}px`,
              overflowX: 'auto',
            }
          : {
              top: triangleDir === 'down' ? `${toolsVisible ? popupHeight + 16 : 0}px` : undefined,
              bottom: triangleDir === 'up' ? `${toolsVisible ? popupHeight + 16 : 0}px` : undefined,
              width: `${popupWidth}px`,
              maxHeight: `${maxSize}px`,
              overflowY: 'auto',
            }),
        scrollbarWidth: 'thin',
      }}
    >
      <div
        className={clsx('flex gap-4', isVertical ? 'h-full flex-row' : 'w-full flex-col')}
        style={
          isVertical
            ? {
                display: 'grid',
                gridAutoFlow: 'column',
                gridAutoColumns: 'max-content',
                minWidth: 'min-content',
                height: `${popupHeight}px`,
                maxHeight: `${popupHeight}px`,
              }
            : {}
        }
      >
        {sortedNotes.map((note, index) => (
          <div
            role='none'
            key={note.id || index}
            onClick={() => {
              if (editingNoteId !== note.id) handleShowAnnotation(note);
            }}
            onKeyDownCapture={(event) => {
              if (editingNoteId !== note.id) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                handleCancel();
              } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                event.stopPropagation();
                handleSave();
              }
            }}
            // Popup surface tokens, but no border of its own: the enclosing
            // Popup already draws the bubble outline that the triangle is
            // aligned to, and a second one doubles it along the triangle side.
            className={clsx(
              'popup-container rounded-lg transition-colors',
              editingNoteId === note.id ? 'cursor-default' : 'cursor-pointer',
              'not-eink:shadow-lg bg-base-300 theme-dark:bg-base-100',
            )}
            style={
              isVertical
                ? {
                    minWidth: 'max-content',
                    height: `${popupHeight}px`,
                    maxHeight: `${popupHeight}px`,
                  }
                : {}
            }
          >
            {note.note && (
              <div
                dir='auto'
                className={clsx(
                  'm-4 hyphens-auto text-justify font-sans text-sm',
                  isVertical && 'writing-vertical-rl',
                )}
                style={
                  isVertical
                    ? {
                        fontFeatureSettings: "'vrt2' 1, 'vert' 1",
                        minWidth: 'max-content',
                      }
                    : {}
                }
              >
                {editingNoteId === note.id ? (
                  <div onClick={(event) => event.stopPropagation()}>
                    <label className='eink-bordered border-base-300 block rounded-lg border px-2 py-1 focus-within:ring-2 focus-within:ring-primary/40'>
                      <span className='sr-only'>{_('Note')}</span>
                      <TextEditor
                        className='!leading-normal'
                        value={editorDraft}
                        onChange={setEditorDraft}
                        onSave={handleSave}
                        onEscape={handleCancel}
                        spellCheck={false}
                        autoFocus
                      />
                    </label>
                    <div className='mt-3 flex justify-end gap-2' dir='ltr'>
                      <button type='button' className='btn btn-ghost btn-sm' onClick={handleCancel}>
                        {_('Cancel')}
                      </button>
                      <button
                        type='button'
                        className='btn btn-contrast btn-sm'
                        onClick={handleSave}
                      >
                        {_('Save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className='flex flex-col justify-between gap-2'>
                    {note.note}
                    <div className='flex items-center justify-between gap-3'>
                      <span className='text-base-content/50 text-sm sm:text-xs'>
                        {dayjs(note.createdAt).fromNow()}
                      </span>
                      <button
                        ref={(button) => {
                          if (!note.id) return;
                          if (button) editButtonRefs.current.set(note.id, button);
                          else editButtonRefs.current.delete(note.id);
                        }}
                        type='button'
                        className='btn btn-ghost btn-xs touch-target p-0 text-blue-500 hover:bg-transparent eink:text-base-content'
                        aria-label={_('Edit')}
                        onClick={(event) => handleEdit(event, note)}
                      >
                        <MdEdit size={editIconSize} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnnotationNotes;
