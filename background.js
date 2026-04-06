importScripts('config.js');

const { SIGHTENGINE_USER, SIGHTENGINE_SECRET, GEMINI_API_KEY, HF_API_KEY } = CONFIG;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "checkAIText", title: "Check Text for AI", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "checkAIText") analyzeText(info.selectionText, tab.id);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_screen") captureAndAnalyzeScreen(sender.tab.id);
});

async function captureAndAnalyzeScreen(tabId) {
  chrome.tabs.sendMessage(tabId, { action: "showScanning" });

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 40 });
    const base64Image = dataUrl.split(',')[1];
    const blob = await (await fetch(dataUrl)).blob();

    // 1. Sightengine (Pixel Forensic)
    const formData = new FormData();
    formData.append('models', 'genai');
    formData.append('api_user', SIGHTENGINE_USER);
    formData.append('api_secret', SIGHTENGINE_SECRET);
    formData.append('media', blob, 'screenshot.jpg');

    const sightPromise = fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: formData
    }).then(res => res.json()).catch(() => ({ status: "error" }));

    // 2. Gemini 2.5 Flash (The 2026 Stable Brain)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPromise = fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Analyze this screen. 1. Detect scams or fake giveaways. 2. Identify if celebrities (like Mbappe) are AI deepfakes. 3. Check for phishing. REPLY ONLY: VERDICT: [AI/SCAM/SAFE] and a 1-sentence REASON." },
            { inline_data: { mime_type: "image/jpeg", data: base64Image } }
          ]
        }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    }).then(res => res.json());

    const [sightData, gemData] = await Promise.all([sightPromise, geminiPromise]);

    // Process Pixels
    let imgVerdict = "Scan Failed"; let imgConf = "0";
    if (sightData.status === "success") {
      const score = sightData.type.ai_generated * 100;
      imgVerdict = score > 50 ? "🤖 AI GENERATED PIXELS" : "📸 REAL CAMERA PIXELS";
      imgConf = score > 50 ? score.toFixed(1) : (100 - score).toFixed(1);
    }

    // Process Gemini Result
    let scamAnalysis = "Gemini Error: Check Console.";
    if (gemData.candidates?.[0]) {
      scamAnalysis = gemData.candidates[0].content.parts[0].text.trim().replace(/\n/g, "<br>");
    } else if (gemData.error) {
      scamAnalysis = "API Error: " + gemData.error.message;
    }

    chrome.tabs.sendMessage(tabId, { action: "showResult", data: { imgVerdict, imgConf, scamAnalysis } });

  } catch (err) {
    chrome.tabs.sendMessage(tabId, { action: "showResult", data: { errorMsg: err.message } });
  }
}

async function analyzeText(text, tabId) {
  chrome.tabs.sendMessage(tabId, { action: "showScanning" });
  try {
    const res = await fetch("https://api-inference.huggingface.co/models/roberta-base-openai-detector", {
      method: "POST",
      headers: { "Authorization": `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text })
    });
    const data = await res.json();
    const aiScore = data[0].find(i => i.label === 'Fake' || i.label === 'LABEL_0').score * 100;
    const verdict = aiScore > 50 ? "🤖 AI TEXT" : "👤 HUMAN TEXT";
    const conf = aiScore > 50 ? aiScore.toFixed(1) : (100 - aiScore).toFixed(1);
    chrome.tabs.sendMessage(tabId, { action: "showTextResult", data: { verdict, conf } });
  } catch (e) { }
}