"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ProtectedPage } from "../lib/ProtectedPage";
import { useRustPilot } from "../lib/useRustPilot";
import { buildUsersCfgLine, type UsersCfgRole } from "../lib/usersCfg";

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
  const [usersRole, setUsersRole] = useState<UsersCfgRole>("ownerid");
  const [usersSteamId, setUsersSteamId] = useState("");
  const [usersName, setUsersName] = useState("");
  const [usersNote, setUsersNote] = useState("");
  const [usersCfgMessage, setUsersCfgMessage] = useState("");
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

  function insertUsersCfgLine() {
    setUsersCfgMessage("");
    try {
      const line = buildUsersCfgLine(usersRole, usersSteamId, usersName, usersNote);
      setContent((current) => {
        const prefix = current.trimEnd();
        return `${prefix}${prefix ? "\n" : ""}${line}\n`;
      });
      setUsersSteamId("");
      setUsersName("");
      setUsersNote("");
    } catch (error) {
      setUsersCfgMessage(error instanceof Error ? error.message : String(error));
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
        <div className={`cfg-editor-main ${selectedFile === "users.cfg" ? "with-helper" : ""}`}>
          {selectedFile === "users.cfg" && (
            <section className="cfg-users-helper" aria-label="Add owner or moderator">
              <div>
                <strong>Add admin user</strong>
                <span>Insert a Rust ownerid or moderatorid line, then save and restart the server.</span>
              </div>
              <div className="cfg-users-helper-grid">
                <label>
                  Role
                  <select value={usersRole} onChange={(event) => setUsersRole(event.target.value as UsersCfgRole)}>
                    <option value="ownerid">Owner</option>
                    <option value="moderatorid">Moderator</option>
                  </select>
                </label>
                <label>
                  SteamID64
                  <input value={usersSteamId} onChange={(event) => setUsersSteamId(event.target.value)} placeholder="76561198000000000" />
                </label>
                <label>
                  Player name
                  <input value={usersName} onChange={(event) => setUsersName(event.target.value)} placeholder="Optional" />
                </label>
                <label>
                  Note
                  <input value={usersNote} onChange={(event) => setUsersNote(event.target.value)} placeholder={usersRole === "ownerid" ? "Owner" : "Moderator"} />
                </label>
                <button type="button" className="primary" onClick={insertUsersCfgLine}>Insert line</button>
              </div>
              {usersCfgMessage && <span className="validation-message error">{usersCfgMessage}</span>}
            </section>
          )}
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
