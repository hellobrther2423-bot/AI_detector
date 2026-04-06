const btn = document.createElement("div");
btn.id = "ai-floating-btn";
btn.innerHTML = "🤖";
document.body.appendChild(btn);

btn.onclick = () => chrome.runtime.sendMessage({ action: "scan_screen" });

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === "showScanning") showPopup("🔍 Running AI analysis...", "loading");
  else if (req.action === "showResult") {
    const { imgVerdict, imgConf, scamAnalysis, errorMsg } = req.data;
    if (errorMsg) return showPopup(`❌ Error: ${errorMsg}`, "res");
    
    const msg = `
      <div style="border-bottom:1px solid #444;margin-bottom:8px;padding-bottom:8px;">
        <strong style="color:#00d2ff;">1. Pixel Scan:</strong><br>${imgVerdict} <span style="color:#888; font-size: 11px;">${imgConf}</span>
      </div>
      <strong style="color:#ff0055;">2. Context Logic:</strong><br>${scamAnalysis}
    `;
    showPopup(msg, "res");
  } else if (req.action === "showTextResult") {
    showPopup(`<strong>Text Verdict:</strong> ${req.data.verdict} <span style="color:#888; font-size: 11px;">${req.data.conf}</span>`, "res");
  }
});

function showPopup(msg, type) {
  let box = document.getElementById("ai-detector-alert");
  if (!box) {
    box = document.createElement("div");
    box.id = "ai-detector-alert";
    document.body.appendChild(box);
  }
  box.innerHTML = `
    <div class="ai-header">Omni-Scanner Pro 🚀</div>
    <div class="ai-body">${msg}</div>
    <button id="ai-close" onclick="this.parentElement.remove()">✖</button>
  `;
  if (type === "res") setTimeout(() => { if (box) box.remove(); }, 12000);
}
