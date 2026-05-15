import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export type PairSubcommand = "capsule" | "accept" | "knock" | "list";

export interface PairCapsule {
  version: 1;
  kind: "teamagent.pair.capsule";
  peer: {
    id: string;
    name: string;
    hostAlias: string;
    host: string;
    user: string;
    port: number;
    publicKeyFingerprint: string;
  };
  createdAt: string;
  expiresAt: string;
  nonce: string;
}

export interface PairedPeer {
  id: string;
  name: string;
  hostAlias: string;
  host: string;
  user: string;
  port: number;
  publicKeyFingerprint: string;
  acceptedAt: string;
  capsuleNonce: string;
  source: "capsule";
}

export interface PeerBook {
  version: 1;
  peers: PairedPeer[];
}

export interface PairCapsuleOptions {
  name: string;
  host: string;
  user?: string;
  port?: number;
  publicKey?: string;
  publicKeyPath?: string;
  homeDir?: string;
  out?: string;
  now?: () => string;
  nonce?: string;
  ttlMinutes?: number;
}

export interface PairAcceptOptions {
  capsule: string;
  homeDir?: string;
  sshConfigPath?: string;
  localName?: string;
  now?: () => string;
  dryRun?: boolean;
}

export interface PairAcceptResult {
  ok: true;
  peer: PairedPeer;
  files: {
    peerBookPath: string;
    receiptPath: string;
    sshConfigPath: string;
  };
  changed: string[];
  dryRun: boolean;
}

export interface PairKnockOptions {
  peer: string;
  homeDir?: string;
  sshConfigPath?: string;
  json?: boolean;
  simulate?: boolean;
  runner?: (args: string[]) => { exitCode: number; stdout: string; stderr: string };
}

export interface PairKnockResult {
  ok: boolean;
  peer: string;
  peerId?: string;
  hostAlias?: string;
  command: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PairListOptions {
  homeDir?: string;
}

export function executePairCapsule(opts: PairCapsuleOptions): {
  capsule: PairCapsule;
  token: string;
  outPath?: string;
} {
  if (!opts.name.trim()) throw new Error("--name is required");
  if (!opts.host.trim()) throw new Error("--host is required");

  const homeDir = opts.homeDir ?? os.homedir();
  const user = opts.user ?? os.userInfo().username;
  const port = opts.port ?? 22;
  const createdAt = opts.now?.() ?? new Date().toISOString();
  const ttlMinutes = opts.ttlMinutes ?? 30;
  const expiresAt = new Date(Date.parse(createdAt) + ttlMinutes * 60_000).toISOString();
  const nonce = opts.nonce ?? crypto.randomBytes(16).toString("hex");
  const publicKey = opts.publicKey ?? readDefaultPublicKey(homeDir, opts.publicKeyPath);
  const publicKeyFingerprint = fingerprintPublicKey(publicKey);
  const hostAlias = `teamagent-${slugify(opts.name)}`;
  const id = `tap_${sha256Hex([
    opts.name,
    opts.host,
    user,
    String(port),
    publicKeyFingerprint,
    nonce,
  ].join("|")).slice(0, 16)}`;

  const capsule: PairCapsule = {
    version: 1,
    kind: "teamagent.pair.capsule",
    peer: {
      id,
      name: opts.name,
      hostAlias,
      host: opts.host,
      user,
      port,
      publicKeyFingerprint,
    },
    createdAt,
    expiresAt,
    nonce,
  };
  const token = `tap1.${base64UrlEncode(JSON.stringify(capsule))}`;

  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, JSON.stringify({ capsule, token }, null, 2) + "\n");
  }

  return { capsule, token, ...(opts.out ? { outPath: opts.out } : {}) };
}

export function executePairAccept(opts: PairAcceptOptions): PairAcceptResult {
  const homeDir = opts.homeDir ?? os.homedir();
  const sshConfigPath = opts.sshConfigPath ?? path.join(homeDir, ".ssh", "config");
  const now = opts.now?.() ?? new Date().toISOString();
  const capsule = decodeCapsule(opts.capsule);
  ensureCapsuleFresh(capsule, now);

  const peer: PairedPeer = {
    ...capsule.peer,
    acceptedAt: now,
    capsuleNonce: capsule.nonce,
    source: "capsule",
  };
  const pairDir = path.join(homeDir, ".teamagent", "pairing");
  const receiptDir = path.join(pairDir, "receipts");
  const peerBookPath = path.join(pairDir, "peers.json");
  const receiptPath = path.join(receiptDir, `${slugify(peer.name)}.json`);
  const changed: string[] = [];

  const currentBook = readPeerBook(peerBookPath);
  const nextBook = upsertPeer(currentBook, peer);
  const nextBookText = JSON.stringify(nextBook, null, 2) + "\n";
  const oldBookText = fs.existsSync(peerBookPath) ? fs.readFileSync(peerBookPath, "utf-8") : "";
  if (oldBookText !== nextBookText) changed.push(peerBookPath);

  const receipt = {
    version: 1,
    kind: "teamagent.pair.receipt",
    localName: opts.localName ?? os.hostname(),
    acceptedAt: now,
    peer,
  };
  const nextReceiptText = JSON.stringify(receipt, null, 2) + "\n";
  const oldReceiptText = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath, "utf-8") : "";
  if (oldReceiptText !== nextReceiptText) changed.push(receiptPath);

  const nextSshConfig = renderManagedSshConfig(
    fs.existsSync(sshConfigPath) ? fs.readFileSync(sshConfigPath, "utf-8") : "",
    peer,
  );
  const oldSshConfig = fs.existsSync(sshConfigPath) ? fs.readFileSync(sshConfigPath, "utf-8") : "";
  if (oldSshConfig !== nextSshConfig) changed.push(sshConfigPath);

  if (!opts.dryRun) {
    fs.mkdirSync(pairDir, { recursive: true });
    fs.mkdirSync(receiptDir, { recursive: true });
    fs.mkdirSync(path.dirname(sshConfigPath), { recursive: true });
    fs.writeFileSync(peerBookPath, nextBookText);
    fs.writeFileSync(receiptPath, nextReceiptText);
    fs.writeFileSync(sshConfigPath, nextSshConfig);
  }

  return {
    ok: true,
    peer,
    files: { peerBookPath, receiptPath, sshConfigPath },
    changed,
    dryRun: opts.dryRun ?? false,
  };
}

export function executePairKnock(opts: PairKnockOptions): PairKnockResult {
  const homeDir = opts.homeDir ?? os.homedir();
  const sshConfigPath = opts.sshConfigPath ?? path.join(homeDir, ".ssh", "config");
  const peerBook = readPeerBook(path.join(homeDir, ".teamagent", "pairing", "peers.json"));
  const peer = peerBook.peers.find((p) => p.name === opts.peer || p.id === opts.peer || p.hostAlias === opts.peer);
  if (!peer) {
    return {
      ok: false,
      peer: opts.peer,
      command: [],
      stdout: "",
      stderr: `unknown peer: ${opts.peer}`,
      exitCode: 2,
    };
  }

  const expected = `teamagent-pair-ok:${peer.id}`;
  const command = ["ssh", "-F", sshConfigPath, peer.hostAlias, "printf", "%s\\\\n", expected];
  if (opts.simulate) {
    return {
      ok: true,
      peer: peer.name,
      peerId: peer.id,
      hostAlias: peer.hostAlias,
      command,
      stdout: `${expected}\n`,
      stderr: "",
      exitCode: 0,
    };
  }

  const runner = opts.runner ?? defaultSshRunner;
  const result = runner(command.slice(1));
  const ok = result.exitCode === 0 && result.stdout.trim() === expected;
  return {
    ok,
    peer: peer.name,
    peerId: peer.id,
    hostAlias: peer.hostAlias,
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

export function executePairList(opts: PairListOptions = {}): PeerBook {
  const homeDir = opts.homeDir ?? os.homedir();
  return readPeerBook(path.join(homeDir, ".teamagent", "pairing", "peers.json"));
}

export function renderPairCapsuleResult(result: ReturnType<typeof executePairCapsule>): string {
  const lines = [
    `握手胶囊已生成: ${result.capsule.peer.name} (${result.capsule.peer.hostAlias})`,
    `peer id: ${result.capsule.peer.id}`,
    `fingerprint: ${result.capsule.peer.publicKeyFingerprint}`,
    `expires: ${result.capsule.expiresAt}`,
  ];
  if (result.outPath) lines.push(`文件: ${result.outPath}`);
  lines.push(`token: ${result.token}`);
  return lines.join("\n") + "\n";
}

export function renderPairAcceptResult(result: PairAcceptResult): string {
  const changed = result.changed.length === 0 ? "无变化" : `${result.changed.length} 个文件已更新`;
  return [
    `已接受 ${result.peer.name} 的握手胶囊`,
    `host: ${result.peer.hostAlias} -> ${result.peer.user}@${result.peer.host}:${result.peer.port}`,
    `fingerprint: ${result.peer.publicKeyFingerprint}`,
    changed,
  ].join("\n") + "\n";
}

export function renderPairKnockResult(result: PairKnockResult): string {
  if (result.ok) {
    return `SSH knock 成功: ${result.peer} (${result.hostAlias})\n${result.stdout}`;
  }
  return `SSH knock 失败: ${result.peer}\nexit=${result.exitCode}\n${result.stderr}`;
}

export function renderPairList(book: PeerBook): string {
  if (book.peers.length === 0) return "尚未配对任何 teammate\n";
  return book.peers
    .map((p) => `${p.name}\t${p.hostAlias}\t${p.user}@${p.host}:${p.port}\t${p.publicKeyFingerprint}`)
    .join("\n") + "\n";
}

export function parsePairArgs(argv: string[]): { subcommand: PairSubcommand; options: Record<string, unknown> } {
  const sub = argv[0] as PairSubcommand | undefined;
  if (!sub || !["capsule", "accept", "knock", "list"].includes(sub)) {
    throw new Error("Usage: teamagent pair <capsule|accept|knock|list> ...");
  }
  const rest = argv.slice(1);
  const flags = parseFlags(rest);

  if (sub === "capsule") {
    const now = stringFlag(flags, "now");
    return {
      subcommand: sub,
      options: {
        name: stringFlag(flags, "name", true),
        host: stringFlag(flags, "host", true),
        user: stringFlag(flags, "user"),
        port: numberFlag(flags, "port"),
        publicKey: stringFlag(flags, "public-key"),
        publicKeyPath: stringFlag(flags, "public-key-path"),
        homeDir: stringFlag(flags, "home-dir"),
        out: stringFlag(flags, "out"),
        ttlMinutes: numberFlag(flags, "ttl-minutes"),
        nonce: stringFlag(flags, "nonce"),
        ...(now ? { now: () => now } : {}),
      },
    };
  }
  if (sub === "accept") {
    const capsule = flags.positionals[0];
    if (!capsule) throw new Error("Usage: teamagent pair accept <capsule-file|token|json>");
    const now = stringFlag(flags, "now");
    return {
      subcommand: sub,
      options: {
        capsule,
        homeDir: stringFlag(flags, "home-dir"),
        sshConfigPath: stringFlag(flags, "ssh-config"),
        localName: stringFlag(flags, "local-name"),
        dryRun: booleanFlag(flags, "dry-run"),
        ...(now ? { now: () => now } : {}),
      },
    };
  }
  if (sub === "knock") {
    const peer = flags.positionals[0];
    if (!peer) throw new Error("Usage: teamagent pair knock <peer>");
    return {
      subcommand: sub,
      options: {
        peer,
        homeDir: stringFlag(flags, "home-dir"),
        sshConfigPath: stringFlag(flags, "ssh-config"),
        json: booleanFlag(flags, "json"),
        simulate: booleanFlag(flags, "simulate"),
      },
    };
  }
  return {
    subcommand: sub,
    options: {
      homeDir: stringFlag(flags, "home-dir"),
      json: booleanFlag(flags, "json"),
    },
  };
}

function defaultSshRunner(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const proc = spawnSync("ssh", args, { encoding: "utf-8", timeout: 10_000 });
  return {
    exitCode: proc.status ?? 124,
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? (proc.error ? String(proc.error) : ""),
  };
}

function readDefaultPublicKey(homeDir: string, explicitPath?: string): string {
  const candidates = explicitPath
    ? [explicitPath]
    : ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"].map((f) => path.join(homeDir, ".ssh", f));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const text = fs.readFileSync(candidate, "utf-8").trim();
      if (text) return text;
    }
  }
  throw new Error("No SSH public key found. Pass --public-key or --public-key-path.");
}

function fingerprintPublicKey(publicKey: string): string {
  const parts = publicKey.trim().split(/\s+/);
  if (parts.length >= 2 && parts[1]) {
    try {
      const digest = crypto.createHash("sha256").update(Buffer.from(parts[1], "base64")).digest("base64");
      return `SHA256:${digest.replace(/=+$/, "")}`;
    } catch {
      // fall through to raw text hash
    }
  }
  return `SHA256:${crypto.createHash("sha256").update(publicKey).digest("base64").replace(/=+$/, "")}`;
}

function decodeCapsule(input: string): PairCapsule {
  let text = input.trim();
  if (fs.existsSync(text)) {
    text = fs.readFileSync(text, "utf-8").trim();
  }
  if (text.startsWith("tap1.")) {
    text = Buffer.from(text.slice("tap1.".length), "base64url").toString("utf-8");
  }
  const parsed = JSON.parse(text) as PairCapsule | { capsule?: PairCapsule };
  const capsule = "capsule" in parsed && parsed.capsule ? parsed.capsule : parsed as PairCapsule;
  if (capsule.version !== 1 || capsule.kind !== "teamagent.pair.capsule") {
    throw new Error("Invalid TeamAgent pairing capsule");
  }
  return capsule;
}

function ensureCapsuleFresh(capsule: PairCapsule, now: string): void {
  if (Date.parse(now) > Date.parse(capsule.expiresAt)) {
    throw new Error(`Pairing capsule expired at ${capsule.expiresAt}`);
  }
}

function readPeerBook(peerBookPath: string): PeerBook {
  if (!fs.existsSync(peerBookPath)) return { version: 1, peers: [] };
  const parsed = JSON.parse(fs.readFileSync(peerBookPath, "utf-8")) as PeerBook;
  if (parsed.version !== 1 || !Array.isArray(parsed.peers)) return { version: 1, peers: [] };
  return parsed;
}

function upsertPeer(book: PeerBook, peer: PairedPeer): PeerBook {
  const peers = book.peers.filter((p) => p.id !== peer.id && p.name !== peer.name && p.hostAlias !== peer.hostAlias);
  peers.push(peer);
  peers.sort((a, b) => a.name.localeCompare(b.name));
  return { version: 1, peers };
}

function renderManagedSshConfig(current: string, peer: PairedPeer): string {
  const start = `# >>> teamagent peer:${peer.id}`;
  const end = `# <<< teamagent peer:${peer.id}`;
  const block = [
    start,
    `Host ${peer.hostAlias}`,
    `  HostName ${peer.host}`,
    `  User ${peer.user}`,
    `  Port ${peer.port}`,
    "  IdentitiesOnly yes",
    "  StrictHostKeyChecking accept-new",
    "  UserKnownHostsFile ~/.ssh/known_hosts",
    `  # TeamAgent-Peer-Fingerprint ${peer.publicKeyFingerprint}`,
    end,
  ].join("\n");
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
  const trimmed = current.endsWith("\n") || current.length === 0 ? current : `${current}\n`;
  if (re.test(trimmed)) return trimmed.replace(re, `${block}\n`);
  return `${trimmed}${trimmed.length > 0 && !trimmed.endsWith("\n\n") ? "\n" : ""}${block}\n`;
}

function parseFlags(argv: string[]): { positionals: string[]; values: Map<string, string | true> } {
  const values = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      values.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values.set(key, next);
      i++;
    } else {
      values.set(key, true);
    }
  }
  return { positionals, values };
}

function stringFlag(flags: ReturnType<typeof parseFlags>, key: string, required?: boolean): string | undefined {
  const v = flags.values.get(key);
  if (v === true || v === undefined) {
    if (required) throw new Error(`--${key} is required`);
    return undefined;
  }
  return v;
}

function numberFlag(flags: ReturnType<typeof parseFlags>, key: string): number | undefined {
  const raw = stringFlag(flags, key);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${key} must be a positive number`);
  return n;
}

function booleanFlag(flags: ReturnType<typeof parseFlags>, key: string): boolean {
  return flags.values.get(key) === true;
}

function slugify(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "peer";
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
