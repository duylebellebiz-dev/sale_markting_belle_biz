import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { useCallback, useEffect } from 'react';
import VariablePicker from './VariablePicker';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/* ─── Tiny icon components to keep the toolbar readable ─────────────────── */
function Icon({ d, title }: { d: string; title?: string }) {
  return (
    <svg title={title} viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function BtnGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 border-r border-gray-200 pr-1.5 mr-0.5 last:border-0 last:pr-0 last:mr-0">{children}</div>;
}

function ToolBtn({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      className={[
        'flex items-center justify-center w-7 h-7 rounded transition-colors text-gray-600',
        active
          ? 'bg-indigo-100 text-indigo-700'
          : 'hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/* ─── CTA Button helper ─────────────────────────────────────────────────── */
function buildCtaHtml(text: string, href: string): string {
  return (
    `<p><a href="${href}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;` +
    `padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">` +
    `${text}</a></p>`
  );
}

/* ─── Editor ─────────────────────────────────────────────────────────────── */
export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit includes bold, italic, strike, code, heading, bulletList,
        // orderedList, blockquote, horizontalRule, hardBreak, history, etc.
        heading: { levels: [1, 2] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      Image.configure({ inline: true, allowBase64: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        'data-placeholder': placeholder ?? 'Write your email body here…',
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync value from parent (e.g. when a template is loaded)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  /* ── link prompt ── */
  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('URL', prev ?? 'https://');
    if (href === null) return;
    if (href.trim() === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: href.trim() }).run();
    }
  }, [editor]);

  /* ── image prompt ── */
  const addImage = useCallback(() => {
    if (!editor) return;
    const src = window.prompt('Image URL');
    if (!src?.trim()) return;
    editor.chain().focus().setImage({ src: src.trim() }).run();
  }, [editor]);

  /* ── CTA button prompt ── */
  const addCta = useCallback(() => {
    if (!editor) return;
    const text = window.prompt('Button label', 'Click Here');
    if (!text?.trim()) return;
    const href = window.prompt('Button URL', 'https://');
    if (!href?.trim()) return;
    editor.chain().focus().insertContent(buildCtaHtml(text.trim(), href.trim())).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 bg-white">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        {/* Text style */}
        <BtnGroup>
          <ToolBtn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Icon d="M6 4h8a4 4 0 0 1 0 8H6z M6 12h9a4 4 0 0 1 0 8H6z" title="Bold" />
          </ToolBtn>
          <ToolBtn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Icon d="M19 4h-9M14 20H5M15 4L9 20" title="Italic" />
          </ToolBtn>
          <ToolBtn title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Icon d="M6 3v7a6 6 0 0 0 12 0V3M4 21h16" title="Underline" />
          </ToolBtn>
          <ToolBtn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Icon d="M16 4H9a3 3 0 0 0-2.83 4M4 12h16M8 20h8a3 3 0 0 0 2.83-4" title="Strike" />
          </ToolBtn>
        </BtnGroup>

        {/* Headings */}
        <BtnGroup>
          <ToolBtn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <span className="text-[11px] font-bold leading-none">H1</span>
          </ToolBtn>
          <ToolBtn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <span className="text-[11px] font-bold leading-none">H2</span>
          </ToolBtn>
        </BtnGroup>

        {/* Lists */}
        <BtnGroup>
          <ToolBtn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" title="BulletList" />
          </ToolBtn>
          <ToolBtn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <Icon d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10H6M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" title="OrderedList" />
          </ToolBtn>
        </BtnGroup>

        {/* Link + Image + CTA */}
        <BtnGroup>
          <ToolBtn title="Link" active={editor.isActive('link')} onClick={setLink}>
            <Icon d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" title="Link" />
          </ToolBtn>
          <ToolBtn title="Inline image" onClick={addImage}>
            <Icon d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8zM3 15l4-4 4 4 3-3 4 4" title="Image" />
          </ToolBtn>
          <ToolBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Icon d="M5 12h14" title="HR" />
          </ToolBtn>
        </BtnGroup>

        {/* CTA button */}
        <BtnGroup>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); addCta(); }}
            title="Insert CTA button"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors leading-none"
          >
            + CTA Button
          </button>
        </BtnGroup>

        {/* Variable picker */}
        <BtnGroup>
          <VariablePicker editor={editor} />
        </BtnGroup>

        {/* Undo / Redo */}
        <BtnGroup>
          <ToolBtn title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
            <Icon d="M9 14 4 9l5-5M4 9h11a4 4 0 0 1 0 8h-1" title="Undo" />
          </ToolBtn>
          <ToolBtn title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
            <Icon d="M15 14l5-5-5-5M19 9H8a4 4 0 0 0 0 8h1" title="Redo" />
          </ToolBtn>
        </BtnGroup>
      </div>

      {/* ── Editor content ── */}
      <EditorContent editor={editor} />
    </div>
  );
}
