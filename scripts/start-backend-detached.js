const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const pythonExe = path.join(
  backendDir,
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python"
);

if (!fs.existsSync(pythonExe)) {
  console.error(`Backend Python executable not found at ${pythonExe}`);
  process.exit(1);
}

const stdoutLog = fs.openSync(path.join(backendDir, "server-run.log"), "a");
const stderrLog = fs.openSync(path.join(backendDir, "server-error.log"), "a");

const child = spawn(
  pythonExe,
  ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8000"],
  {
    cwd: backendDir,
    detached: true,
    stdio: ["ignore", stdoutLog, stderrLog],
    windowsHide: true,
  }
);

child.unref();

console.log(`Started backend on http://127.0.0.1:8000 with PID ${child.pid}`);
