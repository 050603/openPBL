"use client";

import { useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  UploadCloud,
} from "lucide-react";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Optional minimum height in px (defaults to 360). */
  minHeight?: number;
  /** Optional callback when student uploads a file. If provided, an upload button appears in the toolbar. */
  onFileUpload?: (file: File) => void;
};

/**
 * TipTap-powered rich text editor with a formatting toolbar. Used for the
 * solution-reporting (方案汇报) and project-making (项目制作) stages.
 *
 * Supports: bold/italic/underline/strike, headings, lists, quotes, code,
 * horizontal rule, links, images, tables, and text alignment.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "在此输入方案内容...",
  minHeight = 360,
  onFileUpload,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-blue-600 underline" },
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-[6px] max-w-full" },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-slate max-w-none focus:outline-none px-5 py-4 text-[15px] leading-8 min-h-[360px]",
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  // Keep editor in sync if the parent's `value` changes externally (e.g. when
  // loading a saved draft). We avoid clobbering when the editor already has
  // the same content to prevent caret jumps.
  useEffect(() => {
    if (!editor) return;
    if (value && editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const insertImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("请输入图片 URL：");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const insertLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("链接 URL：", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div
        className="rounded-[6px] border border-slate-200 bg-slate-50"
        style={{ minHeight }}
      />
    );
  }

  const ToolBtn = ({
    active,
    disabled,
    onClick,
    title,
    children,
  }: {
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-[5px] text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 ${
        active ? "bg-blue-50 text-blue-700" : ""
      }`}
    >
      {children}
    </button>
  );

  const Divider = () => <span className="mx-1 h-5 w-px bg-slate-200" />;

  return (
    <div className="overflow-hidden rounded-[8px] border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/80 px-2 py-1.5">
        <ToolBtn title="撤销" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 size={16} />
        </ToolBtn>
        <ToolBtn title="重做" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 size={16} />
        </ToolBtn>
        <Divider />
        <ToolBtn title="标题1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={16} />
        </ToolBtn>
        <ToolBtn title="标题2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={16} />
        </ToolBtn>
        <ToolBtn title="标题3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={16} />
        </ToolBtn>
        <Divider />
        <ToolBtn title="加粗" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={16} />
        </ToolBtn>
        <ToolBtn title="斜体" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={16} />
        </ToolBtn>
        <ToolBtn title="下划线" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={16} />
        </ToolBtn>
        <ToolBtn title="删除线" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={16} />
        </ToolBtn>
        <ToolBtn title="行内代码" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code size={16} />
        </ToolBtn>
        <Divider />
        <ToolBtn title="无序列表" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={16} />
        </ToolBtn>
        <ToolBtn title="有序列表" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </ToolBtn>
        <ToolBtn title="引用" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={16} />
        </ToolBtn>
        <ToolBtn title="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={16} />
        </ToolBtn>
        <Divider />
        <ToolBtn title="左对齐" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft size={16} />
        </ToolBtn>
        <ToolBtn title="居中" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter size={16} />
        </ToolBtn>
        <ToolBtn title="右对齐" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight size={16} />
        </ToolBtn>
        <Divider />
        <ToolBtn title="插入链接" active={editor.isActive("link")} onClick={insertLink}>
          <Link2 size={16} />
        </ToolBtn>
        <ToolBtn title="插入图片" onClick={insertImage}>
          <ImageIcon size={16} />
        </ToolBtn>
        <ToolBtn title="插入表格" onClick={insertTable}>
          <TableIcon size={16} />
        </ToolBtn>
        {onFileUpload ? (
          <>
            <Divider />
            <label
              className="grid h-8 cursor-pointer place-items-center rounded-[5px] text-slate-600 transition hover:bg-slate-100"
              title="上传文件"
            >
              <UploadCloud size={16} />
              <input
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.mp4"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onFileUpload(file);
                    e.target.value = "";
                  }
                }}
                type="file"
              />
            </label>
          </>
        ) : null}
      </div>
      <EditorContent editor={editor} />
      <style jsx global>{`
        .ProseMirror {
          min-height: ${minHeight}px;
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
        }
        .ProseMirror th,
        .ProseMirror td {
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          text-align: left;
        }
        .ProseMirror th {
          background: #f1f5f9;
          font-weight: 600;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #cbd5e1;
          padding-left: 12px;
          color: #475569;
          margin: 8px 0;
        }
        .ProseMirror code {
          background: #f1f5f9;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.95em;
        }
        .ProseMirror pre {
          background: #0f172a;
          color: #e2e8f0;
          padding: 10px 12px;
          border-radius: 6px;
          overflow-x: auto;
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}
