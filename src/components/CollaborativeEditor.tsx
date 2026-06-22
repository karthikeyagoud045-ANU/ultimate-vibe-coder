"use client";

import { useEffect, useRef, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { updatePresence, UserPresenceState } from "@/lib/yjs-provider";

interface CollaborativeEditorProps {
  ytext: Y.Text;
  provider: WebsocketProvider;
  language?: string;
  onContentChange?: (content: string) => void;
}

export default function CollaborativeEditor({
  ytext,
  provider,
  language = "javascript",
  onContentChange,
}: CollaborativeEditorProps) {
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      // Create Yjs ↔ Monaco binding
      const model = editor.getModel();
      if (model) {
        bindingRef.current = new MonacoBinding(
          ytext,
          model,
          new Set([editor]),
          provider.awareness
        );
      }

      // Track cursor position for awareness
      const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
        updatePresence(provider, {
          cursor: {
            lineNumber: e.position.lineNumber,
            column: e.position.column,
          },
          status: "editing",
        });
      });

      // Track selection
      const selectionDisposable = editor.onDidChangeCursorSelection((e) => {
        const sel = e.selection;
        if (
          sel.startLineNumber !== sel.endLineNumber ||
          sel.startColumn !== sel.endColumn
        ) {
          updatePresence(provider, {
            selection: {
              startLineNumber: sel.startLineNumber,
              startColumn: sel.startColumn,
              endLineNumber: sel.endLineNumber,
              endColumn: sel.endColumn,
            },
          });
        } else {
          updatePresence(provider, { selection: null });
        }
      });

      // Notify parent of content changes
      const contentDisposable = editor.onDidChangeModelContent(() => {
        if (onContentChange) {
          onContentChange(editor.getValue());
        }
      });

      // Render remote cursors from awareness
      const renderRemoteCursors = () => {
        if (!editorRef.current) return;

        const newDecorations: MonacoType.editor.IModelDeltaDecoration[] = [];
        const states = provider.awareness.getStates();

        states.forEach((state, clientId) => {
          if (clientId === provider.awareness.clientID) return;
          const user = state.user as UserPresenceState | undefined;
          if (!user || !user.cursor) return;

          // Cursor line decoration
          newDecorations.push({
            range: new monaco.Range(
              user.cursor.lineNumber,
              user.cursor.column,
              user.cursor.lineNumber,
              user.cursor.column
            ),
            options: {
              className: `remote-cursor-${clientId}`,
              afterContentClassName: `remote-cursor-widget`,
              stickiness:
                monaco.editor.TrackedRangeStickiness
                  .NeverGrowsWhenTypingAtEdges,
              hoverMessage: { value: `**${user.username}**` },
            },
          });

          // Selection decoration
          if (user.selection) {
            newDecorations.push({
              range: new monaco.Range(
                user.selection.startLineNumber,
                user.selection.startColumn,
                user.selection.endLineNumber,
                user.selection.endColumn
              ),
              options: {
                className: `remote-selection`,
                stickiness:
                  monaco.editor.TrackedRangeStickiness
                    .NeverGrowsWhenTypingAtEdges,
              },
            });
          }

          // Inject dynamic CSS for this user's color
          const styleId = `cursor-style-${clientId}`;
          if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
              .remote-cursor-${clientId} {
                border-left: 2px solid ${user.color} !important;
              }
              .remote-cursor-widget::after {
                content: '';
                position: absolute;
                top: 0;
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: ${user.color};
                transform: translateX(-4px);
              }
            `;
            document.head.appendChild(style);
          }
        });

        decorationsRef.current = editorRef.current.deltaDecorations(
          decorationsRef.current,
          newDecorations
        );
      };

      // Listen for awareness changes
      provider.awareness.on("change", renderRemoteCursors);

      // Store cleanup function
      editor.onDidDispose(() => {
        cursorDisposable.dispose();
        selectionDisposable.dispose();
        contentDisposable.dispose();
        provider.awareness.off("change", renderRemoteCursors);
      });

      // Focus editor
      editor.focus();
    },
    [ytext, provider, onContentChange]
  );

  useEffect(() => {
    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
    };
  }, []);

  return (
    <div className="editor-container">
      <Editor
        height="100%"
        defaultLanguage={language}
        theme="vs-dark"
        onMount={handleEditorMount}
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          cursorBlinking: "smooth",
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
          lineNumbers: "on",
          glyphMargin: false,
          folding: true,
          wordWrap: "on",
          suggest: {
            showKeywords: true,
            showSnippets: true,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
        }}
      />
      {/* Remote cursor/selection styling */}
      <style jsx global>{`
        .remote-selection {
          background: hsla(217, 91%, 60%, 0.15) !important;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
