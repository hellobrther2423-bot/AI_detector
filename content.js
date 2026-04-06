const btnContainer = document.getElementById("ai-scan-btn-container") || document.createElement("div");
if (!btnContainer.id) {
    btnContainer.id = "ai-scan-btn-container";
    document.body.appendChild(btnContainer);
}

const btn = document.createElement("div");
btn.id = "ai-floating-btn";

btn.innerHTML = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 26px; height: 26px; stroke: white; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M8.5 11.5l2.5 2.5 4.5-4.5" stroke="#38BDF8"/>
  </svg>
`;
btnContainer.appendChild(btn);

btn.onclick = () => chrome.runtime.sendMessage({ action: "scan_screen" });

let popupTimer; 

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === "showScanning") showPopup("🔍 Initializing security scan...", "loading");
  else if (req.action === "showResult") {
    const { imgVerdict, imgConf, scamAnalysis, errorMsg } = req.data;
    if (errorMsg) return showPopup(`❌ Error: ${errorMsg}`, "res");
    
    const msg = `
      <div class="premium-section">
        <strong class="premium-title">1. Visual Forensics</strong>
        <div class="premium-result">${imgVerdict} <span class="premium-conf">${imgConf}</span></div>
      </div>
      <div class="premium-section no-border">
        <strong class="premium-title">2. Context Analysis</strong>
        <div class="premium-result">${scamAnalysis}</div>
      </div>
    `;
    showPopup(msg, "res");
  } else if (req.action === "showTextResult") {
    showPopup(`<strong class="premium-title">Text Analysis:</strong> <span class="premium-result">${req.data.verdict}</span> <span class="premium-conf">${req.data.conf}</span>`, "res");
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
    <div class="ai-header">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="header-icon"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      Omni-Scanner Pro
    </div>
    <div class="ai-body">${msg}</div>
    <button id="ai-close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;
  
  document.getElementById("ai-close").onclick = () => { box.remove(); };
  
  clearTimeout(popupTimer); 
  if (type === "res") popupTimer = setTimeout(() => { if (document.getElementById("ai-detector-alert")) box.remove(); }, 30000);
}
