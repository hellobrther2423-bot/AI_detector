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

    // 2. Gemini Logic (With STRICTER IMAGE_TYPE Classifier)
    const geminiPrompt = `Analyze this screen for a deepfake and scam detector.
    1. Classify the main content: Is the primary focus a 'PHOTO' (a person, face, animal, or realistic scene meant to be checked for deepfakes)? Or is it 'TEXT' (social media feeds, documents, handwritten notes, diagrams, math problems, UI elements)?
    2. Detect scams, fake giveaways, or phishing.
    3. Identify if celebrities are AI deepfakes.
    REPLY EXACTLY IN THIS FORMAT:
    IMAGE_TYPE: [PHOTO or TEXT]
    VERDICT: [AI or SCAM or SAFE]
    REASON: [1-sentence explanation]`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPromise = fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: geminiPrompt },
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

    // Parse Gemini Context First to see if it's text-only
    let scamAnalysis = "Gemini Error: Check Console.";
    let isTextOnly = false;

    if (gemData.candidates?.[0]) {
      const rawText = gemData.candidates[0].content.parts[0].text.trim();
      // Made the check case-insensitive just to be extra safe
      isTextOnly = rawText.toUpperCase().includes("IMAGE_TYPE: TEXT");
      
      // Remove the "IMAGE_TYPE:" line safely so the UI looks clean
      scamAnalysis = rawText.replace(/IMAGE_TYPE:.*?\n/ig, '').replace(/\n/g, "<br>");
    } else if (gemData.error) {
      scamAnalysis = "API Error: " + gemData.error.message;
    }

    // Process Pixels 
    let imgVerdict = "Scan Failed"; let imgConf = "";

    if (isTextOnly) {
      // IF IT'S JUST TEXT/UI: Override the pixel engine entirely
      imgVerdict = "📝 JUST TEXT (No Photo to scan)";
      imgConf = ""; 
    } else if (sightData.status === "success") {
      // IF IT'S A PHOTO: Do the normal AI vs Camera math
      const score = sightData.type.ai_generated * 100;
      imgVerdict = score > 50 ? "AI GENERATED PIXELS" : "REAL CAMERA PIXELS";
      imgConf = score > 50 ? `(${score.toFixed(1)}%)` : `(${(100 - score).toFixed(1)}%)`;
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
    const verdict = aiScore > 50 ? " AI TEXT" : " HUMAN TEXT";
    const conf = aiScore > 50 ? aiScore.toFixed(1) : (100 - aiScore).toFixed(1);
    chrome.tabs.sendMessage(tabId, { action: "showTextResult", data: { verdict, conf: `(${conf}%)` } });
  } catch (e) { }
}
