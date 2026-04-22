import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useContract } from "./hooks/useContract";
import { ethers } from "ethers";


// ─── Tabs ──────────────────────────────────────────────────────
const TABS = ["issue", "verify", "revoke", "manage", "history"];
const TAB_LABELS = {
  issue: "Cấp Chứng Chỉ",
  verify: "Xác Thực",
  revoke: "Thu Hồi",
  manage: "Quản Lý Issuer",
  history: "Lịch Sử",
};
const TAB_ICONS = {
  issue: "◈",
  verify: "◉",
  revoke: "◌",
  manage: "◎",
  history: "◷",
};

export default function App() {
  const { provider, contract, account, isIssuer: hookIsIssuer, connect: realConnect } = useContract();
  const [isOwner, setIsOwner] = useState(false);
  const [isIssuer, setIsIssuer] = useState(false);
  const [activeTab, setActiveTab] = useState("verify");
  const [status, setStatus] = useState<{ type: "success" | "error" | "info", message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Issue form
  const [studentName, setStudentName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [rawData, setRawData] = useState("");
  const [degree, setDegree] = useState("Cử nhân");
  const [issuedCred, setIssuedCred] = useState<{ credentialId: string, credHash: string } | null>(null);

  // Verify form
  const [verifyId, setVerifyId] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);

  // Revoke form
  const [revokeId, setRevokeId] = useState("");

  // Manage form
  const [newIssuerAddr, setNewIssuerAddr] = useState("");
  const [issuerList] = useState<string[]>([]);

  // History (Simulated for now derived from events or local storage if needed, but keeping it simple)
  const [txHistory, setTxHistory] = useState<any[]>([]);

  // ── Sync with Contract ───────────────────────────────────────
  // useEffect 1: sync contract + role
  useEffect(() => {
    if (contract && account) {
      setIsIssuer(hookIsIssuer);
      checkOwner();
    }
  }, [contract, account, hookIsIssuer]);

  // useEffect 2: reset UI khi đổi account
  useEffect(() => {
    setVerifyResult(null);
    setIssuedCred(null);
  }, [account]);

  const checkOwner = async () => {
    if (!contract) return;
    try {
      const owner = await contract.owner();
      setIsOwner(owner.toLowerCase() === account?.toLowerCase());
    } catch (e) {
      console.error("Lỗi kiểm tra owner:", e);
    }
  };

  const connect = async () => {
    try {
      setLoading(true);
      await realConnect();
      setStatus({ type: "success", message: "Đã kết nối ví thành công!" });
    } catch (e: any) {
      setStatus({ type: "error", message: e.message || "Không thể kết nối ví." });
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    window.location.reload(); // Simple way to reset ethers state for demo
  };

  // ── Issue Credential ────────────────────────────────────────
  const issueCredential = async () => {
    if (!studentName || !courseName || !rawData) {
      setStatus({ type: "error", message: "Vui lòng điền đầy đủ thông tin." });
      return;
    }
    if (!contract) return;

    try {
      setLoading(true);
      setStatus({ type: "info", message: "Đang yêu cầu chữ ký ví..." });

      // Tính hash dùng contract utility (hoặc ethers)
      const credHash = ethers.keccak256(ethers.toUtf8Bytes(rawData));

      const tx = await contract.issueCredential(studentName, `${degree} - ${courseName}`, credHash);
      setStatus({ type: "info", message: "Giao dịch đang được xử lý trên Blockchain..." });

      const receipt = await tx.wait();

      // Lấy ID từ event log
      const iface = contract.interface;
      let credentialId = "N/A";
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "CredentialIssued") {
            credentialId = parsed.args[0];
            break;
          }
        } catch { }
      }

      setIssuedCred({ credentialId, credHash });
      setVerifyResult(null);
      setVerifyId(credentialId);
      setActiveTab("verify");
      setStatus({ type: "success", message: "Phát hành chứng chỉ thành công!" });
      setStudentName(""); setCourseName(""); setRawData(""); setDegree("Cử nhân");

      // Add to history
      setTxHistory(prev => [{
        type: "CredentialIssued",
        credentialId,
        studentName,
        courseName: `${degree} - ${courseName}`,
        timestamp: Math.floor(Date.now() / 1000),
        txHash: receipt.hash
      }, ...prev]);

    } catch (e: any) {
      console.error(e);
      setStatus({ type: "error", message: e.reason || e.message || "Giao dịch thất bại." });
    } finally {
      setLoading(false);
    }
  };

  // ── Verify Credential ───────────────────────────────────────
  const verifyCredential = async () => {
    if (!verifyId.trim()) {
      setStatus({ type: "error", message: "Vui lòng nhập Credential ID." });
      return;
    }
    if (!ethers.isHexString(verifyId.trim(), 32)) {
      setStatus({
        type: "error",
        message: "Credential ID phải là bytes32 hợp lệ (0x + 64 ký tự hex). KHÔNG phải địa chỉ contract."
      });
      return;
    }
    if (!contract) {
      setStatus({ type: "error", message: "Vui lòng kết nối ví để xác thực (hoặc thiết lập Read-only provider)." });
      return;
    }

    try {
      setLoading(true);
      setVerifyResult(null);
      setStatus({ type: "info", message: "Đang truy vấn Blockchain..." });

      const [isValid, cred] = await contract.verifyCredential(verifyId.trim());

      setVerifyResult({
        isValid,
        credential: {
          studentName: cred.studentName,
          courseName: cred.courseName,
          issuer: cred.issuer,
          issueDate: Number(cred.issueDate),
          isRevoked: cred.isRevoked,
          credentialHash: cred.credentialHash
        }
      });
      setStatus(null);
    } catch (e: any) {
      setStatus({ type: "error", message: "ID không tồn tại hoặc lỗi mạng." });
    } finally {
      setLoading(false);
    }
  };

  // ── Revoke Credential ───────────────────────────────────────
  const revokeCredential = async () => {
    if (!revokeId.trim()) {
      setStatus({ type: "error", message: "Vui lòng nhập Credential ID cần thu hồi." });
      return;
    }
    if (!contract) return;

    try {
      setLoading(true);
      setStatus({ type: "info", message: "Đang gửi giao dịch thu hồi..." });

      const tx = await contract.revokeCredential(revokeId.trim());
      const receipt = await tx.wait();

      setStatus({ type: "success", message: "Thu hồi chứng chỉ thành công!" });
      setRevokeId("");

      setTxHistory(prev => [{
        type: "CredentialRevoked",
        credentialId: revokeId.trim(),
        timestamp: Math.floor(Date.now() / 1000),
        txHash: receipt.hash
      }, ...prev]);

    } catch (e: any) {
      setStatus({ type: "error", message: e.reason || e.message || "Không thể thu hồi." });
    } finally {
      setLoading(false);
    }
  };

  // ── Manage Issuers ──────────────────────────────────────────
  const authorizeIssuer = async () => {
    if (!newIssuerAddr.trim() || !contract) return;
    try {
      setLoading(true);
      const tx = await contract.authorizeIssuer(newIssuerAddr.trim());
      await tx.wait();
      setStatus({ type: "success", message: `Đã cấp quyền cho ${newIssuerAddr.trim()}` });
      setNewIssuerAddr("");
    } catch (e: any) {
      setStatus({ type: "error", message: e.reason || e.message });
    } finally {
      setLoading(false);
    }
  };

  const revokeIssuer = async (addr: string) => {
    if (!contract) return;
    try {
      setLoading(true);
      const tx = await contract.revokeIssuer(addr);
      await tx.wait();
      setStatus({ type: "success", message: `Đã thu hồi quyền của ${addr}` });
    } catch (e: any) {
      setStatus({ type: "error", message: e.reason || e.message });
    } finally {
      setLoading(false);
    }
  };

  // ── Copy to clipboard ───────────────────────────────────────
  const copy = (text) => {
    navigator.clipboard?.writeText(text).catch(() => { });
    setStatus({ type: "info", message: "Đã sao chép!" });
    setTimeout(() => setStatus(null), 1500);
  };

  const hashPreview = rawData
    ? ethers.keccak256(ethers.toUtf8Bytes(rawData))
    : null;

  // ── UI ──────────────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* Background grid */}
      <div style={s.bgGrid} />

      {/* Header */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logo}>⬡</div>
          <div>
            <div style={s.logoTitle}>CredentialChain</div>
            <div style={s.logoSub}>Academic Registry · Localhost Node</div>
          </div>
        </div>
        <div style={s.headerRight}>
          {account ? (
            <div style={s.walletBox}>
              <div style={s.walletDot} />
              <span style={s.walletAddr}>{account.slice(0, 6)}...{account.slice(-4)}</span>
              {isOwner && <span style={s.tagOwner}>OWNER</span>}
              {isIssuer && !isOwner && <span style={s.tagIssuer}>ISSUER</span>}
              <button style={s.btnGhost} onClick={disconnect}>Ngắt kết nối</button>
            </div>
          ) : (
            <button style={s.btnConnect} onClick={connect}>
              🦊 Kết nối MetaMask
            </button>
          )}
        </div>
      </header>

      {/* Stats bar */}
      <div style={s.statsBar}>
        {[
          { label: "Tổng chứng chỉ", value: txHistory.filter(t => t.type === "CredentialIssued").length },
          { label: "Đã thu hồi", value: txHistory.filter(t => t.type === "CredentialRevoked").length },
          { label: "Authorized Issuers", value: issuerList.length || 1 },
          { label: "Transactions", value: txHistory.length },
        ].map((stat, i) => (
          <div key={i} style={s.statItem}>
            <span style={s.statValue}>{stat.value}</span>
            <span style={s.statLabel}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Tab nav */}
      <nav style={s.tabNav}>
        {TABS.filter(t => {
          if (t === "issue" || t === "revoke") return isIssuer;
          if (t === "manage") return isOwner;
          return true;
        }).map(tab => (
          <button key={tab} style={{ ...s.tabBtn, ...(activeTab === tab ? s.tabBtnActive : {}) }}
            onClick={() => { setActiveTab(tab); setStatus(null); }}>
            <span style={s.tabIcon}>{TAB_ICONS[tab]}</span>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {/* Status toast */}
      {status && (
        <div style={{ ...s.toast, ...s[`toast_${status.type}`] }}>
          {status.type === "success" && "✓ "}
          {status.type === "error" && "✕ "}
          {status.type === "info" && "◌ "}
          {status.message}
        </div>
      )}

      {/* Main panel */}
      <main style={s.main}>

        {/* ── TAB: Issue ── */}
        {activeTab === "issue" && (
          <div style={s.panel}>
            <h2 style={s.panelTitle}>◈ Cấp Chứng Chỉ Mới</h2>
            <p style={s.panelDesc}>Tạo và lưu chứng chỉ học thuật bất biến trên Blockchain.</p>

            <div style={s.formGrid}>
              <div style={s.field}>
                <label style={s.label}>Tên sinh viên <span style={s.req}>*</span></label>
                <input style={s.input} placeholder="Họ Tên"
                  value={studentName} onChange={e => setStudentName(e.target.value)} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Loại bằng cấp <span style={s.req}>*</span></label>
                <select style={s.input} value={degree} onChange={e => setDegree(e.target.value)}>
                  {["Cử nhân", "Kỹ sư", "Thạc sĩ", "Tiến sĩ", "Chứng chỉ nghề", "Diploma"].map(d => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div style={{ ...s.field, gridColumn: "1/-1" }}>
                <label style={s.label}>Tên khóa học / ngành <span style={s.req}>*</span></label>
                <input style={s.input} placeholder="Khóa học / Ngành"
                  value={courseName} onChange={e => setCourseName(e.target.value)} />
              </div>
              <div style={{ ...s.field, gridColumn: "1/-1" }}>
                <label style={s.label}>Nội dung chứng chỉ <span style={s.req}>*</span></label>
                <textarea style={s.textarea}
                  placeholder="Dán nội dung văn bản chứng chỉ, JSON metadata, hoặc bất kỳ dữ liệu nào — sẽ được hash SHA3 (keccak256) tự động..."
                  value={rawData} onChange={e => setRawData(e.target.value)} />
                {hashPreview && (
                  <div style={s.hashBox}>
                    <span style={s.hashLabel}>keccak256</span>
                    <span style={s.hashVal}>{hashPreview}</span>
                    <button style={s.copyBtn} onClick={() => copy(hashPreview)}>⎘</button>
                  </div>
                )}
              </div>
            </div>

            <button style={s.btnPrimary} onClick={issueCredential} disabled={loading || !account}>
              {loading ? <span style={s.spinner}>⟳</span> : "◈"} &nbsp;
              {loading ? "Đang xử lý..." : "Phát hành Chứng Chỉ"}
            </button>

            {issuedCred && (
              <div style={s.successCard}>
                <div style={s.successHeader}>✓ Chứng chỉ đã được ghi lên Blockchain</div>
                <div style={s.credRow}>
                  <span style={s.credKey}>Credential ID</span>
                  <span style={s.credVal}>{issuedCred.credentialId}</span>
                  <button style={s.copyBtn} onClick={() => copy(issuedCred.credentialId)}>⎘</button>
                </div>
                <div style={s.credRow}>
                  <span style={s.credKey}>Hash</span>
                  <span style={s.credVal}>{issuedCred.credHash}</span>
                  <button style={s.copyBtn} onClick={() => copy(issuedCred.credHash)}>⎘</button>
                </div>
                <p style={s.credNote}>Lưu lại Credential ID để xác thực sau này.</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Verify ── */}
        {activeTab === "verify" && (
          <div style={s.panel}>
            <h2 style={s.panelTitle}>◉ Xác Thực Chứng Chỉ</h2>
            <p style={s.panelDesc}>Tra cứu tính hợp lệ của chứng chỉ — không cần ví, hoàn toàn công khai.</p>

            <div style={s.searchRow}>
              <input style={{ ...s.input, flex: 1 }}
                placeholder="Nhập Credential ID (bytes32) — 0x..."
                value={verifyId} onChange={e => setVerifyId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && verifyCredential()} />
              <button style={s.btnPrimary} onClick={verifyCredential} disabled={loading}>
                {loading ? <span style={s.spinner}>⟳</span> : "◉"} &nbsp;
                {loading ? "Đang kiểm tra..." : "Xác Thực"}
              </button>
            </div>

            {/* Demo helper: list known credentials */}

            {verifyResult && (
              <div style={{ ...s.verifyCard, borderColor: verifyResult.isValid ? "#22c55e" : "#ef4444" }}>
                <div style={{ ...s.verifyBanner, background: verifyResult.isValid ? "#14532d" : "#450a0a" }}>
                  <span style={{ fontSize: 24 }}>{verifyResult.isValid ? "✓" : "✕"}</span>
                  <span style={s.verifyStatus}>
                    {verifyResult.isValid ? "CHỨNG CHỈ HỢP LỆ" : "CHỨNG CHỈ ĐÃ BỊ THU HỒI"}
                  </span>
                </div>
                <div style={s.verifyGrid}>
                  {[
                    ["Sinh viên", verifyResult.credential.studentName],
                    ["Loại bằng", verifyResult.credential.degree || "—"],
                    ["Khóa học / Ngành", verifyResult.credential.courseName],
                    ["Cấp bởi (issuer)", verifyResult.credential.issuer],
                    ["Ngày cấp", new Date(verifyResult.credential.issueDate * 1000).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric" })],
                    ["Trạng thái", verifyResult.credential.isRevoked ? "ĐÃ THU HỒI" : "CÒN HIỆU LỰC"],
                  ].map(([k, v]) => (
                    <div key={k} style={s.verifyRow}>
                      <span style={s.verifyKey}>{k}</span>
                      <span style={s.verifyVal}>{v}</span>
                    </div>
                  ))}
                  <div style={s.verifyRow}>
                    <span style={s.verifyKey}>Credential Hash</span>
                    <span style={{ ...s.verifyVal, fontFamily: "monospace", fontSize: 11, color: "#94a3b8", wordBreak: "break-all" }}>
                      {verifyResult.credential.credentialHash}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Revoke ── */}
        {activeTab === "revoke" && isIssuer && (
          <div style={s.panel}>
            <h2 style={s.panelTitle}>◌ Thu Hồi Chứng Chỉ</h2>
            <p style={s.panelDesc}>Thu hồi chứng chỉ khi phát hiện sai sót. Hành động này không thể hoàn tác.</p>

            <div style={s.warnBox}>
              ⚠ Chỉ issuer gốc mới có thể thu hồi chứng chỉ do mình cấp. Thao tác sẽ được ghi vĩnh viễn lên Blockchain.
            </div>

            <label style={s.label}>Credential ID cần thu hồi <span style={s.req}>*</span></label>
            <div style={s.searchRow}>
              <input style={{ ...s.input, flex: 1 }}
                placeholder="0x..."
                value={revokeId} onChange={e => setRevokeId(e.target.value)} />
              <button style={{ ...s.btnPrimary, background: "#dc2626" }} onClick={revokeCredential} disabled={loading || !account}>
                {loading ? <span style={s.spinner}>⟳</span> : "◌"} &nbsp;
                {loading ? "Đang xử lý..." : "Thu Hồi"}
              </button>
            </div>

            {/* Issued-by-me list */}
          </div>
        )}

        {/* ── TAB: Manage Issuers ── */}
        {activeTab === "manage" && isOwner && (
          <div style={s.panel}>
            <h2 style={s.panelTitle}>◎ Quản Lý Issuer</h2>
            <p style={s.panelDesc}>Owner có thể cấp hoặc thu hồi quyền cấp chứng chỉ của các địa chỉ ví.</p>

            <label style={s.label}>Thêm Issuer mới</label>
            <div style={s.searchRow}>
              <input style={{ ...s.input, flex: 1 }}
                placeholder="0x... (địa chỉ ví Ethereum)"
                value={newIssuerAddr} onChange={e => setNewIssuerAddr(e.target.value)} />
              <button style={s.btnPrimary} onClick={authorizeIssuer} disabled={loading}>
                + Cấp Quyền
              </button>
            </div>

            <div style={s.issuerList}>
              <div style={s.issuerListTitle}>Danh sách Authorized Issuers</div>
              {issuerList.map(addr => (
                <div key={addr} style={s.issuerItem}>
                  <div style={s.issuerAddr}>
                    <div style={{ ...s.walletDot, background: "#22c55e" }} />
                    {addr}
                    {/* Tag OWNER if applicable — already handled by isOwner state but keeping logic locally consistent */}
                    {addr.toLowerCase() === account?.toLowerCase() && <span style={s.tagOwner}>OWNER</span>}
                  </div>
                  {addr.toLowerCase() !== account?.toLowerCase() && (
                    <button style={s.btnRevoke} onClick={() => revokeIssuer(addr)}>
                      Thu Hồi
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: History ── */}
        {activeTab === "history" && (
          <div style={s.panel}>
            <h2 style={s.panelTitle}>◷ Lịch Sử Giao Dịch</h2>
            <p style={s.panelDesc}>Nhật ký sự kiện trên Blockchain — minh bạch và bất biến.</p>

            {txHistory.length === 0 ? (
              <div style={s.emptyState}>Chưa có giao dịch nào. Hãy cấp hoặc xác thực chứng chỉ đầu tiên.</div>
            ) : (
              <div style={s.txList}>
                {txHistory.map((tx, i) => (
                  <div key={i} style={s.txItem}>
                    <div style={{ ...s.txType, ...(tx.type === "CredentialIssued" ? s.txTypeIssue : tx.type === "CredentialRevoked" ? s.txTypeRevoke : s.txTypeManage) }}>
                      {tx.type === "CredentialIssued" ? "ISSUED" : tx.type === "CredentialRevoked" ? "REVOKED" : tx.type.replace("Issuer", " ISSUER")}
                    </div>
                    <div style={s.txBody}>
                      {tx.studentName && <div style={s.txMain}>{tx.studentName} — {tx.degree} — {tx.courseName}</div>}
                      {tx.type === "IssuerAuthorized" && <div style={s.txMain}>Cấp quyền cho {tx.issuer}</div>}
                      {tx.type === "IssuerRevoked" && <div style={s.txMain}>Thu hồi quyền của {tx.issuer}</div>}
                      {tx.type === "CredentialRevoked" && <div style={s.txMain}>Thu hồi {tx.credentialId?.slice(0, 20)}...</div>}
                      <div style={s.txMeta}>
                        <span>{new Date(tx.timestamp * 1000).toLocaleString("vi-VN")}</span>
                        <span style={s.txHash}>tx: {tx.txHash?.slice(0, 18)}...</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Not connected prompt */}
        {!account && activeTab !== "verify" && (
          <div style={s.connectPrompt}>
            <div style={s.connectIcon}>⬡</div>
            <div style={s.connectTitle}>Kết nối ví để tiếp tục</div>
            <div style={s.connectDesc}>Cần kết nối MetaMask để sử dụng tính năng này.</div>
            <button style={s.btnPrimary} onClick={() => connect()}>🦊 Kết nối MetaMask</button>
          </div>
        )}
      </main>

      <footer style={s.footer}>
        CredentialChain · Smart Contract: 0x5FbD...8aa3 · Localhost 8545 · v2.0.0
      </footer>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const s: Record<string, CSSProperties> = {
  root: { minHeight: "100vh", background: "#0a0f1a", color: "#e2e8f0", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", position: "relative", overflow: "hidden" },
  bgGrid: { position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none", zIndex: 0 },

  header: { position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(10,15,26,0.95)", backdropFilter: "blur(12px)" },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  logo: { fontSize: 32, color: "#3b82f6", lineHeight: 1 },
  logoTitle: { fontSize: 18, fontWeight: 700, letterSpacing: "0.05em", color: "#f1f5f9" },
  logoSub: { fontSize: 11, color: "#475569", letterSpacing: "0.08em", marginTop: 2 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },

  walletBox: { display: "flex", alignItems: "center", gap: 10, background: "rgba(30,41,59,0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 14px" },
  walletDot: { width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 },
  walletAddr: { fontSize: 12, color: "#94a3b8", letterSpacing: "0.04em" },
  tagOwner: { background: "#7c3aed", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 10, letterSpacing: "0.08em" },
  tagIssuer: { background: "#0369a1", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 10, letterSpacing: "0.08em" },

  statsBar: { position: "relative", zIndex: 10, display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,23,42,0.9)" },
  statItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", borderRight: "1px solid rgba(255,255,255,0.05)" },
  statValue: { fontSize: 22, fontWeight: 700, color: "#3b82f6", letterSpacing: "-0.02em" },
  statLabel: { fontSize: 10, color: "#475569", letterSpacing: "0.08em", marginTop: 2 },

  tabNav: { position: "relative", zIndex: 10, display: "flex", padding: "0 32px", background: "rgba(10,15,26,0.9)", borderBottom: "1px solid rgba(255,255,255,0.06)", gap: 4 },
  tabBtn: { padding: "14px 20px", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 12, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 8, borderBottom: "2px solid transparent", transition: "all 0.2s" },
  tabBtnActive: { color: "#e2e8f0", borderBottomColor: "#3b82f6" },
  tabIcon: { fontSize: 14 },

  toast: { position: "relative", zIndex: 10, margin: "16px 32px 0", padding: "10px 16px", borderRadius: 6, fontSize: 12, letterSpacing: "0.04em" },
  toast_success: { background: "rgba(20,83,45,0.8)", border: "1px solid #16a34a", color: "#86efac" },
  toast_error: { background: "rgba(69,10,10,0.8)", border: "1px solid #dc2626", color: "#fca5a5" },
  toast_info: { background: "rgba(12,74,110,0.8)", border: "1px solid #0284c7", color: "#7dd3fc" },

  main: { position: "relative", zIndex: 10, padding: "32px", maxWidth: 860, margin: "0 auto" },
  panel: { background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 32, backdropFilter: "blur(8px)" },
  panelTitle: { fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 6, letterSpacing: "0.02em" },
  panelDesc: { fontSize: 13, color: "#64748b", marginBottom: 28, letterSpacing: "0.02em" },

  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase" },
  req: { color: "#f43f5e" },
  input: { background: "rgba(30,41,59,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" },
  textarea: { background: "rgba(30,41,59,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "10px 14px", color: "#e2e8f0", fontSize: 12, fontFamily: "monospace", outline: "none", minHeight: 100, resize: "vertical", boxSizing: "border-box", width: "100%" },

  hashBox: { display: "flex", alignItems: "center", gap: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 4, padding: "6px 10px", marginTop: 6 },
  hashLabel: { fontSize: 10, color: "#3b82f6", letterSpacing: "0.1em", flexShrink: 0 },
  hashVal: { fontSize: 10, color: "#7dd3fc", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  copyBtn: { background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, padding: "0 4px", flexShrink: 0 },

  btnPrimary: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "11px 24px", background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.04em", gap: 6 },
  btnGhost: { background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#94a3b8", padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  btnConnect: { background: "#2563eb", border: "none", borderRadius: 6, color: "#fff", padding: "9px 18px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  btnRevoke: { background: "none", border: "1px solid #dc2626", borderRadius: 4, color: "#f87171", padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },

  spinner: { display: "inline-block", animation: "spin 1s linear infinite" },

  successCard: { marginTop: 24, background: "rgba(20,83,45,0.2)", border: "1px solid #16a34a", borderRadius: 8, overflow: "hidden" },
  successHeader: { background: "#14532d", padding: "10px 16px", fontSize: 13, color: "#86efac", letterSpacing: "0.04em" },
  credRow: { display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid rgba(22,163,74,0.15)" },
  credKey: { fontSize: 10, color: "#4ade80", letterSpacing: "0.1em", minWidth: 120, textTransform: "uppercase" },
  credVal: { fontSize: 11, color: "#86efac", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  credNote: { fontSize: 11, color: "#4ade80", padding: "8px 16px", margin: 0 },

  searchRow: { display: "flex", gap: 10, marginBottom: 20, alignItems: "stretch" },

  demoBox: { background: "rgba(30,41,59,0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 16, marginBottom: 20 },
  demoTitle: { fontSize: 10, color: "#475569", letterSpacing: "0.1em", marginBottom: 10, textTransform: "uppercase" },
  demoItem: { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, padding: "4px 0", fontFamily: "monospace" },

  verifyCard: { border: "2px solid", borderRadius: 10, overflow: "hidden", marginTop: 8 },
  verifyBanner: { display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" },
  verifyStatus: { fontSize: 16, fontWeight: 700, letterSpacing: "0.06em" },
  verifyGrid: { padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 },
  verifyRow: { display: "flex", gap: 12, alignItems: "flex-start" },
  verifyKey: { fontSize: 11, color: "#64748b", minWidth: 150, letterSpacing: "0.06em", textTransform: "uppercase", paddingTop: 2 },
  verifyVal: { fontSize: 13, color: "#e2e8f0", flex: 1 },

  warnBox: { background: "rgba(120,53,15,0.3)", border: "1px solid #92400e", borderRadius: 6, padding: "12px 16px", fontSize: 12, color: "#fbbf24", marginBottom: 24, letterSpacing: "0.02em" },

  issuerList: { marginTop: 24 },
  issuerListTitle: { fontSize: 11, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 },
  issuerItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(30,41,59,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, marginBottom: 8 },
  issuerAddr: { display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },

  txList: { display: "flex", flexDirection: "column", gap: 10 },
  txItem: { display: "flex", gap: 14, background: "rgba(30,41,59,0.4)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "14px 16px", alignItems: "flex-start" },
  txType: { fontSize: 9, letterSpacing: "0.1em", padding: "4px 8px", borderRadius: 4, flexShrink: 0, marginTop: 2 },
  txTypeIssue: { background: "rgba(20,83,45,0.6)", color: "#4ade80", border: "1px solid #166534" },
  txTypeRevoke: { background: "rgba(69,10,10,0.6)", color: "#f87171", border: "1px solid #7f1d1d" },
  txTypeManage: { background: "rgba(46,16,101,0.6)", color: "#c4b5fd", border: "1px solid #4c1d95" },
  txBody: { flex: 1, minWidth: 0 },
  txMain: { fontSize: 13, color: "#e2e8f0", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  txMeta: { display: "flex", gap: 16, fontSize: 10, color: "#475569" },
  txHash: { fontFamily: "monospace", color: "#334155" },

  emptyState: { textAlign: "center", color: "#334155", fontSize: 14, padding: "60px 0" },

  connectPrompt: { textAlign: "center", padding: "60px 0" },
  connectIcon: { fontSize: 48, color: "#1e3a5f", marginBottom: 16 },
  connectTitle: { fontSize: 18, color: "#475569", marginBottom: 8 },
  connectDesc: { fontSize: 13, color: "#334155", marginBottom: 24 },

  footer: { position: "relative", zIndex: 10, textAlign: "center", padding: "20px 32px", fontSize: 10, color: "#1e293b", letterSpacing: "0.08em", borderTop: "1px solid rgba(255,255,255,0.04)", marginTop: 40 },
};