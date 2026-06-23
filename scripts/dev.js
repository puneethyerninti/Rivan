const { execFileSync, spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const pythonExe = path.join(
  backendDir,
  ".venv",
  isWindows ? "Scripts" : "bin",
  isWindows ? "python.exe" : "python"
);
const npmCmd = isWindows ? "npm.cmd" : "npm";
const backendOnly = process.argv.includes("--backend-only");
const childProcesses = [];

function quoteForCmd(value) {
  if (/[\s"]/u.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function commandForCmd(command) {
  return /\s/u.test(command) ? `"${command}"` : command;
}

function spawnProcess(label, command, args, cwd, envOverrides = {}) {
  const childEnv = { ...process.env, ...envOverrides };
  const child = isWindows && command.toLowerCase().endsWith(".cmd")
    ? spawn("cmd.exe", ["/d", "/s", "/c", `${commandForCmd(command)} ${args.map(quoteForCmd).join(" ")}`], {
        cwd,
        env: childEnv,
        stdio: "inherit",
        windowsHide: true,
      })
    : spawn(command, args, {
        cwd,
        env: childEnv,
        stdio: "inherit",
        windowsHide: true,
      });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${label}] exited with signal ${signal}`);
      return;
    }
    if (typeof code === "number" && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      process.exitCode = code;
    }
  });

  childProcesses.push(child);
  return child;
}

function checkPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findOpenPort(startPort, host = "127.0.0.1", attempts = 10) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = startPort + offset;
    // eslint-disable-next-line no-await-in-loop
    const isOpen = await checkPort(port, host);
    if (isOpen) return port;
  }
  throw new Error(`No open port found from ${startPort} to ${startPort + attempts - 1}`);
}

function shutdown() {
  for (const child of childProcesses) {
    if (child && !child.killed) child.kill("SIGINT");
  }
}

function ensureBackendEnvDefaults() {
  const envPath = path.join(backendDir, ".env");
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split(/\r?\n/u)
    : [];

  const hasKey = (key) =>
    lines.some((line) => line.trim().startsWith(`${key}=`));

  let changed = false;

  if (!hasKey("MONGO_URL")) {
    lines.push('MONGO_URL="mongodb://localhost:27017"');
    changed = true;
  }

  if (!hasKey("DB_NAME")) {
    lines.push('DB_NAME="rivaan"');
    changed = true;
  }

  if (!hasKey("JWT_SECRET")) {
    lines.push(`JWT_SECRET="${crypto.randomBytes(24).toString("hex")}"`);
    changed = true;
    console.log("[backend] Added missing JWT_SECRET to backend/.env for local development.");
  }

  if (changed) {
    fs.writeFileSync(envPath, `${lines.filter(Boolean).join("\n")}\n`, "utf8");
  }
}

async function main() {
  if (!fs.existsSync(pythonExe)) {
    console.error(`Backend Python executable not found at ${pythonExe}`);
    process.exit(1);
  }

  ensureBackendEnvDefaults();

  const backendPort = 8000;
  if (isWindows) {
    try {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `$path='${pythonExe.replace(/'/g, "''")}'; Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $path } | Stop-Process -Force`,
        ],
        { stdio: "ignore" }
      );
    } catch {
      // keep going; no matching backend process is fine
    }
  }

  const backendPortOpen = await checkPort(backendPort, "0.0.0.0");
  if (!backendPortOpen) {
    console.log(`[backend] port ${backendPort} is already in use by another process.`);
  }

  spawnProcess(
    "backend",
    pythonExe,
    ["-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", String(backendPort)],
    backendDir
  );

  if (backendOnly) return;

  const frontendPort = await findOpenPort(8081);
  spawnProcess(
    "frontend",
    npmCmd,
    ["run", "start", "--", "--lan", "-c", "--port", String(frontendPort)],
    frontendDir,
    { EXPO_NO_DOCTOR: "1" }
  );
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
