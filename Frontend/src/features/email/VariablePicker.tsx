import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { VARIABLES } from './emailTemplatesApi';

interface Props {
  editor: Editor | null;
  /** When inserting into a plain <input> instead of the rich-text editor */
  onInsertText?: (token: string) => void;
}

export default function VariablePicker({ editor, onInsertText }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function insert(token: string) {
    setOpen(false);
    if (onInsertText) {
      onInsertText(token);
      return;
    }
    if (editor) {
      editor.chain().focus().insertContent(token).run();
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Insert variable"
        className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors"
      >
        <span className="font-mono text-[11px]">{'{…}'}</span>
        Variables
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-52 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm">
          <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Insert variable
          </p>
          {VARIABLES.map(({ token, label }) => (
            <button
              key={token}
              type="button"
              onMouseDown={(e) => {
                // Prevent the editor from losing focus
                e.preventDefault();
                insert(token);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 flex items-center justify-between gap-2"
            >
              <span className="text-gray-700">{label}</span>
              <span className="font-mono text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                {token}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
