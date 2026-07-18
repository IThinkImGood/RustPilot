import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface SpawnOptions {
  cwd?: string;
}

export interface ProcessRunner {
  spawn(executable: string, args: string[], options?: SpawnOptions): ChildProcessWithoutNullStreams;
}

export class NodeProcessRunner implements ProcessRunner {
  spawn(executable: string, args: string[], options: SpawnOptions = {}): ChildProcessWithoutNullStreams {
    return spawn(executable, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
  }
}
