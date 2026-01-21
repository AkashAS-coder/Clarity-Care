const REPLACEMENTS = [
  [/(pt\b|patient\b)/gi, "the patient"],
  [/(hx|history) of/gi, "history of"],
  [/htn/gi, "high blood pressure"],
  [/dm2|t2dm/gi, "type 2 diabetes"],
  [/dyspnea/gi, "shortness of breath"],
  [/sob/gi, "shortness of breath"],
  [/echo/gi, "heart ultrasound"],
  [/acei/gi, "blood pressure medicine"],
  [/f\/u|follow[- ]?up/gi, "follow-up appointment"],
  [/prn/gi, "as needed"],
  [/bid/gi, "twice a day"],
  [/qd/gi, "once a day"],
  [/qhs/gi, "at bedtime"],
  [/dx/gi, "diagnosis"],
  [/rx/gi, "prescription"],
  [/labs?/gi, "blood tests"],
  [/stat/gi, "right away"],
  [/w\//gi, "with"],
  [/c\//gi, "with"],
  [/r\/o/gi, "rule out"],
  [/neg/gi, "negative"],
  [/pos/gi, "positive"],
  [/ed/gi, "emergency department"],
  [/er/gi, "emergency room"],
  [/bp/gi, "blood pressure"],
  [/hr/gi, "heart rate"]
];

const HIGHLIGHT_TERMS = [
  "high blood pressure",
  "type 2 diabetes",
  "shortness of breath",
  "heart ultrasound",
  "blood pressure medicine",
  "follow-up appointment",
  "blood tests",
  "emergency department",
  "emergency room",
  "blood pressure",
  "heart rate"
];

const AUDIENCE_WRAP = {
  adult: "Here is a clear explanation:",
  teen: "Here is a simpler, teen-friendly explanation:",
  caregiver: "Here is a clear explanation for family or caregivers:",
  esl: "Here is a plain-English explanation (short sentences):"
};

const TONE_HINT = {
  warm: "You are not alone. This is common and treatable.",
  direct: "Key points and next steps:",
  coach: "Here is what you can do next:"
};

const AI_ENDPOINT = "https://health-assist-lvkw.onrender.com/translate";

const SAMPLES = [
  {
    label: "Hypertension follow-up",
    text: "Pt w/ HTN and DM2 reports dyspnea on exertion. Recommend echo; start ACEi; f/u in 2 weeks. R/O CHF. Labs neg."
  },
  {
    label: "Post-op visit",
    text: "Pt s/p cholecystectomy. Incisions c/d/i, pain controlled w/ ibuprofen PRN. Return to clinic in 10 days."
  },
  {
    label: "ED discharge",
    text: "Dx: viral URI. Encourage fluids, rest, and OTC meds. Return to ED if SOB or chest pain."
  }
];

function escapeHtml(str){
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightTerms(text){
  let html = escapeHtml(text);
  for(const term of HIGHLIGHT_TERMS){
    const pattern = new RegExp(`\\b${term}\\b`, "gi");
    html = html.replace(pattern, match => `<mark>${match}</mark>`);
  }
  return html;
}

function simplify(text){
  let result = text;
  for(const [pattern, repl] of REPLACEMENTS){
    result = result.replace(pattern, repl);
  }
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

function countSyllables(word){
  const cleaned = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const matches = cleaned.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function computeStats(text){
  const words = text.trim().match(/\b[\w']+\b/g) || [];
  const sentences = text.split(/[.!?]/).map(s => s.trim()).filter(Boolean);
  const wordCount = words.length;
  const sentenceCount = Math.max(sentences.length, 1);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const readingEase = Math.round(206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / Math.max(wordCount, 1)));
  const readTime = Math.max(1, Math.ceil(wordCount / 200));
  let clarity = "Standard";
  if(readingEase >= 80){clarity = "Easy";}
  else if(readingEase <= 50){clarity = "Complex";}
  return { wordCount, readTime, clarity, readingEase };
}

function extractActions(text){
  const sentences = text.split(/[.!?]/).map(s => s.trim()).filter(Boolean);
  const actions = sentences.filter(s => /(recommend|start|schedule|call|follow|return|take|rest|encourage)/i.test(s));
  return actions.length ? actions : ["Ask your care team to explain any parts you do not understand."];
}

function buildOutput(text, audience, tone, highlight){
  const simple = simplify(text);
  const actions = extractActions(simple);
  return buildOutputFromResult(simple, actions, audience, tone, highlight);
}

function buildOutputFromResult(simple, actions, audience, tone, highlight){
  const simpleHtml = highlight ? highlightTerms(simple) : escapeHtml(simple);
  return {
    html: `
      <div class="result-card">
        <div class="chip">Plain-language version</div>
        <p>${AUDIENCE_WRAP[audience]}</p>
        <p>${simpleHtml}</p>
      </div>
      <div class="result-card">
        <strong>${TONE_HINT[tone]}</strong>
        <ul>${actions.map(a => `<li>${escapeHtml(a)}.</li>`).join("")}</ul>
      </div>
      <div class="result-card">
        <strong>What to ask next</strong>
        <ul>
          <li>What should I watch for at home?</li>
          <li>When should I come back or call?</li>
          <li>What changes can I make this week?</li>
        </ul>
      </div>`,
    simple,
    actions
  };
}

const noteEl = document.getElementById("note");
const outEl = document.getElementById("output");
const translationNotes = document.getElementById("translationNotes");
const wordCountEl = document.getElementById("wordCount");
const readTimeEl = document.getElementById("readTime");
const clarityEl = document.getElementById("clarity");
const highlightToggle = document.getElementById("highlight");
const autoToggle = document.getElementById("auto");
const aiToggle = document.getElementById("useAi");

let lastOutput = null;
let autoTimer = null;

function updateMetrics(){
  const stats = computeStats(noteEl.value);
  wordCountEl.textContent = stats.wordCount;
  readTimeEl.textContent = `${stats.readTime} min`;
  clarityEl.textContent = stats.clarity;
}

async function renderOutput(){
  const text = noteEl.value.trim();
  outEl.innerHTML = "";
  if(!text){
    outEl.innerHTML = '<div class="result-card">Paste a doctor\'s note to translate.</div>';
    translationNotes.textContent = "Paste a note to see translation notes.";
    lastOutput = null;
    updateMetrics();
    return;
  }
  const audience = document.getElementById("audience").value;
  const tone = document.getElementById("tone").value;
  const highlight = highlightToggle.checked;
  if(aiToggle && aiToggle.checked){
    outEl.innerHTML = '<div class="result-card">AI translation in progress...</div>';
    try{
      const response = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, audience, tone })
      });
      if(!response.ok){
        throw new Error("AI request failed");
      }
      const data = await response.json();
      const simple = data.simple || data.output || "";
      const actions = Array.isArray(data.actions) && data.actions.length
        ? data.actions
        : extractActions(simple);
      const result = buildOutputFromResult(simple || text, actions, audience, tone, highlight);
      outEl.innerHTML = result.html;
      const stats = computeStats(result.simple);
      translationNotes.textContent = `AI mode: clarity score ${stats.readingEase}. Actions found: ${result.actions.length}.`;
      lastOutput = result;
      updateMetrics();
    }catch{
      outEl.innerHTML = '<div class="result-card">AI service unavailable. Using standard translation.</div>';
      const result = buildOutput(text, audience, tone, highlight);
      outEl.innerHTML += result.html;
      const stats = computeStats(result.simple);
      translationNotes.textContent = `Standard mode: clarity score ${stats.readingEase}. Actions found: ${result.actions.length}.`;
      lastOutput = result;
      updateMetrics();
    }
    return;
  }
  const result = buildOutput(text, audience, tone, highlight);
  outEl.innerHTML = result.html;
  const stats = computeStats(result.simple);
  translationNotes.textContent = `Clarity score: ${stats.readingEase} (estimated). Actions found: ${result.actions.length}.`;
  lastOutput = result;
  updateMetrics();
}

document.getElementById("translate").addEventListener("click", renderOutput);

document.getElementById("copy").addEventListener("click", async () => {
  if(!lastOutput){return;}
  const plainText = `${lastOutput.simple}\n\nNext steps:\n${lastOutput.actions.map(a => `- ${a}`).join("\n")}`;
  try{
    await navigator.clipboard.writeText(plainText);
  }catch{
    const area = document.createElement("textarea");
    area.value = plainText;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
});

document.getElementById("clear").addEventListener("click", () => {
  noteEl.value = "";
  renderOutput();
});

document.getElementById("download").addEventListener("click", () => {
  if(!lastOutput){return;}
  const plainText = `${lastOutput.simple}\n\nNext steps:\n${lastOutput.actions.map(a => `- ${a}`).join("\n")}`;
  const blob = new Blob([plainText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plain-language-summary.txt";
  link.click();
  URL.revokeObjectURL(url);
});

function scheduleAuto(){
  if(!autoToggle.checked){return;}
  clearTimeout(autoTimer);
  autoTimer = setTimeout(renderOutput, 350);
}

noteEl.addEventListener("input", () => {
  updateMetrics();
  scheduleAuto();
});
document.getElementById("audience").addEventListener("change", renderOutput);
document.getElementById("tone").addEventListener("change", renderOutput);
highlightToggle.addEventListener("change", renderOutput);
if(aiToggle){
  aiToggle.addEventListener("change", renderOutput);
}

const samplesWrap = document.getElementById("samples");
SAMPLES.forEach(sample => {
  const btn = document.createElement("button");
  btn.className = "sample-btn";
  btn.type = "button";
  btn.textContent = sample.label;
  btn.addEventListener("click", () => {
    noteEl.value = sample.text;
    renderOutput();
  });
  samplesWrap.appendChild(btn);
});

renderOutput();

const TAB_CONTENT = {
  translate: {
    title: "Translate",
    body: "Instant plain-language rewrite with optional highlights."
  },
  actions: {
    title: "Actions",
    body: "Detects follow-up steps and turns them into a checklist."
  },
  questions: {
    title: "Questions",
    body: "Suggests what to ask during the next visit or call."
  },
  metrics: {
    title: "Metrics",
    body: "Tracks word count, reading time, and clarity score."
  }
};

const tabButtons = document.querySelectorAll(".tab");
const tabTitle = document.getElementById("tabTitle");
const tabBody = document.getElementById("tabBody");

if(tabButtons.length && tabTitle && tabBody){
  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      const key = button.dataset.tab;
      const content = TAB_CONTENT[key] || TAB_CONTENT.translate;
      tabTitle.textContent = content.title;
      tabBody.textContent = content.body;
    });
  });
}
