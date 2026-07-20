"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ProtectedPage } from "../lib/ProtectedPage";
import { useRustPilot } from "../lib/useRustPilot";

interface CfgFileSummary {
  name: string;
  description: string;
  exists: boolean;
  sizeBytes: number;
}

interface CfgFileListResponse {
  directory: string;
  files: CfgFileSummary[];
}

interface CfgFileResponse {
  name: string;
  content: string;
  exists: boolean;
}

export default function CfgEditorPage() {
  const guard = useRustPilot();
  const [directory, setDirectory] = useState("");
  const [files, setFiles] = useState<CfgFileSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = content !== originalContent;
  const selectedSummary = files.find((file) => file.name === selectedFile);

  async function loadList() {
    setBusy("list");
    setMessage("");
    try {
      const response = await api<CfgFileListResponse>("/cfg-files");
      setDirectory(response.directory);
      setFiles(response.files);
      const nextFile = selectedFile || response.files[0]?.name || "";
      setSelectedFile(nextFile);
      if (nextFile) await loadFile(nextFile);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function loadFile(fileName: string) {
    setBusy("file");
    setMessage("");
    setSelectedFile(fileName);
    try {
      const response = await api<CfgFileResponse>(`/cfg-files/${encodeURIComponent(fileName)}`);
      setContent(response.content);
      setOriginalContent(response.content);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function saveFile() {
    if (!selectedFile) return;
    setBusy("save");
    setMessage("");
    setMessageKind("ok");
    try {
      const response = await api<CfgFileResponse>(`/cfg-files/${encodeURIComponent(selectedFile)}`, {
        method: "PUT",
        body: JSON.stringify({ content })
      });
      setContent(response.content);
      setOriginalContent(response.content);
      await loadList();
      setMessage(`${selectedFile} saved.`);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (guard.status?.setup?.setupCompleted) void loadList();
  }, [guard.status?.setup?.setupCompleted]);

  return (
    <ProtectedPage status={guard.status} error={guard.error} loading={guard.loading} onRetry={guard.refresh}>
      <section className="card cfg-editor-panel">
        <div className="cfg-editor-header">
          <div>
            <h2>Rust server cfg files</h2>
            <p className="muted" title={directory}>{directory || "Loading cfg directory..."}</p>
          </div>
          <button onClick={loadList} disabled={busy !== null}>{busy === "list" ? "Refreshing..." : "Refresh"}</button>
        </div>
        <div className="cfg-editor-toolbar">
          <label className="cfg-file-picker">
            <span className="cfg-file-picker-header">
              <span>File</span>
              <strong>{selectedSummary?.exists ? `${selectedSummary.sizeBytes} bytes` : "will be created"}</strong>
            </span>
            <select value={selectedFile} onChange={(event) => void loadFile(event.target.value)} disabled={busy !== null || files.length === 0}>
              {files.map((file) => (
                <option value={file.name} key={file.name}>
                  {file.name}{file.exists ? ` (${file.sizeBytes} bytes)` : " (will be created)"}
                </option>
              ))}
            </select>
          </label>
          <p className="cfg-file-description">{selectedSummary?.description ?? "Select a cfg file."}</p>
        </div>
        <div className="cfg-editor-main">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            spellCheck={false}
            disabled={!selectedFile || busy !== null}
            placeholder={selectedFile ? `${selectedFile} is empty.` : "Select a cfg file."}
          />
          <div className="cfg-editor-actions">
            <span className={messageKind === "error" ? "validation-message error" : "muted"}>
              {message || (dirty ? "Unsaved changes." : selectedFile ? "No changes." : "")}
            </span>
            <div className="actions">
              <button onClick={() => loadFile(selectedFile)} disabled={!selectedFile || busy !== null || !dirty}>Revert</button>
              <button className="primary" onClick={saveFile} disabled={!selectedFile || busy !== null || !dirty}>
                {busy === "save" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </ProtectedPage>
  );
}
