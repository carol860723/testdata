/***********************
 *  代碼分庫 + 狀態（全域）
 ************************/
let currentKey = null;
let fullQuestions = [];   // 此代碼完整題庫
let questions = [];       // 本次練習題目
let wrongQuestions = [];  // 錯題本
let index = 0, score = 0;

/* 作答紀錄（回上一題需要） */
let userChoices   = [];   // 每題使用者選了哪個選項（index），沒答過 = undefined
let shownFeedback = [];   // 每題是否已顯示回饋（true/false）

/* LocalStorage key helpers */
const bankKeyStore = 'quiz_bank_key';
const qKey = () => `myQuestions_${currentKey}`;
const wKey = () => `wrongList_${currentKey}`;

/* 啟動 */
document.addEventListener('DOMContentLoaded', () => {
  const savedKey = localStorage.getItem(bankKeyStore);
  if (savedKey) { currentKey = savedKey; initByKey(); }
  else { showOnly('login'); }
});

/* 登入 / 切換代碼 */
function setBankKey() {
  const v = (document.getElementById('bankKey')?.value || '').trim();
  if (!v) { alert('請先輸入題庫代碼'); return; }
  currentKey = v;
  localStorage.setItem(bankKeyStore, currentKey);
  initByKey();
}
function switchBank() {
  currentKey = null;
  localStorage.removeItem(bankKeyStore);
  index = 0; score = 0;
  showOnly('login');
}

/* 依代碼初始化 */
function initByKey() {
  updateKeyChips();

  try { fullQuestions = JSON.parse(localStorage.getItem(qKey()) || '[]'); } catch { fullQuestions = []; }
  try { wrongQuestions = JSON.parse(localStorage.getItem(wKey()) || '[]'); } catch { wrongQuestions = []; }

  if (fullQuestions.length === 0) showOnly('setup');
  else startQuiz();
}
function updateKeyChips() {
  ['keyLabel_setup','keyLabel_quiz','keyLabel_wrong'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.textContent = currentKey || '-';
  });
}
function showOnly(which) {
  ['login','setup','quiz','wrongBox'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = (id === which) ? 'block' : 'none';
  });
  updateKeyChips();
}

/* 儲存題庫 */
function saveQuestions() {
  if (!currentKey) { alert('請先輸入題庫代碼'); return; }
  try {
    const raw = document.getElementById('jsonInput').value.trim();
    if (!raw) { alert('請貼上題庫 JSON'); return; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) { alert('需為陣列且至少一題'); return; }

    for (let i=0;i<parsed.length;i++) {
      const t = parsed[i];
      if (!t.q || !Array.isArray(t.options) || typeof t.answer !== 'number') {
        alert(`第 ${i+1} 題格式須含 q / options[] / answer`); return;
      }
      if (t.answer < 0 || t.answer >= t.options.length) {
        alert(`第 ${i+1} 題 answer 超出選項範圍`); return;
      }
    }

    fullQuestions = parsed;
    wrongQuestions = [];
    localStorage.setItem(qKey(), JSON.stringify(fullQuestions));
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));

    alert('題庫已儲存！');
    startQuiz();
  } catch(e){ console.error(e); alert('JSON 解析失敗'); }
}

/* 開始練習 */
function startQuiz() {
  showOnly('quiz');

  applyQuestionCount(false);  // 依下拉抽題（從完整題庫）
  shuffle(questions);

  // 重置作答紀錄
  userChoices   = new Array(questions.length).fill(undefined);
  shownFeedback = new Array(questions.length).fill(false);

  index = 0; score = 0;
  document.getElementById('total').textContent = questions.length;
  document.getElementById('score').textContent = score;
  document.getElementById('progress').style.width = '0%';
  const fb = document.getElementById('feedback'); if (fb){ fb.textContent=''; fb.className=''; }

  loadQuestion();
}

/* 題數控制：永遠以完整題庫為母體重抽 */
function applyQuestionCount(fromUser = false) {
  const sel = document.getElementById('questionCount');
  const v = sel ? sel.value : 'all';

  const pool = [...fullQuestions];
  shuffle(pool);

  if (v === 'all') {
    questions = pool;
  } else {
    const n = Math.min(parseInt(v, 10), pool.length);
    questions = pool.slice(0, n);
  }

  // 畫面同步
  if (fromUser) {
    index = 0; score = 0;

    // 當使用者改題數 → 重置作答紀錄
    userChoices   = new Array(questions.length).fill(undefined);
    shownFeedback = new Array(questions.length).fill(false);

    document.getElementById('score').textContent = score;
    document.getElementById('progress').style.width = '0%';
    const fb = document.getElementById('feedback'); if (fb){ fb.textContent=''; fb.className=''; }
    document.getElementById('total').textContent = questions.length;
    loadQuestion();
  } else {
    document.getElementById('total').textContent = questions.length;
  }
}

/* 出題 / 作答 */
function loadQuestion() {
  if (!questions.length) { alert('目前題庫為空，請先貼題'); showOnly('setup'); return; }
  const q = questions[index];

  // 進度 / 題幹
  document.getElementById('progress').style.width = `${(index / questions.length) * 100}%`;
  document.getElementById('current').textContent = index + 1;
  document.getElementById('question').textContent = q.q;

  // 選項
  const box = document.getElementById('options'); box.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn fade';
    btn.textContent = opt;
    btn.onclick = () => checkAnswer(i);
    box.appendChild(btn);
  });

  // 還原或清空回饋
  const fb = document.getElementById('feedback');
  const btns = document.querySelectorAll('.option-btn');

  if (shownFeedback[index]) {
    const chosen = userChoices[index];

    if (chosen === q.answer) {
      fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
      fb.className = 'correct';
    } else {
      fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
      fb.className = 'incorrect';
    }

    // 鎖定 + 還原樣式
    btns.forEach((b, i) => {
      b.disabled = true;
      b.classList.remove('correct','incorrect','chosen','locked');
      b.classList.add('locked');
      if (i === q.answer) b.classList.add('correct');
    });
    if (typeof chosen === 'number' && btns[chosen]) {
      btns[chosen].classList.add('chosen');
      if (chosen !== q.answer) btns[chosen].classList.add('incorrect');
    }
  } else {
    fb.textContent = ''; fb.className = '';
    btns.forEach(b => {
      b.disabled = false;
      b.classList.remove('correct','incorrect','chosen','locked');
    });
  }
}

function checkAnswer(choice) {
  const q  = questions[index];
  const fb = document.getElementById('feedback');
  const btns = document.querySelectorAll('.option-btn');

  // 記錄作答
  userChoices[index]   = choice;
  shownFeedback[index] = true;

  // 顯示回饋
  if (choice === q.answer) {
    fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'correct';
    score++; document.getElementById('score').textContent = score;
  } else {
    fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'incorrect';
    addWrong(q);
  }

  // 鎖定並標示狀態
  btns.forEach((b, i) => {
    b.disabled = true;
    b.classList.remove('correct','incorrect','chosen','locked');
    b.classList.add('locked');
    if (i === q.answer) b.classList.add('correct');
  });
  if (btns[choice]) {
    btns[choice].classList.add('chosen');
    if (choice !== q.answer) btns[choice].classList.add('incorrect');
  }
}

/* 上/下一題 */
function prevQuestion() {
  if (index <= 0) return;  // 第一題就不動
  index--;
  loadQuestion();
}
function nextQuestion() {
  index++;
  if (index >= questions.length) {
    document.getElementById('progress').style.width = '100%';
    setTimeout(() => {
      alert(`練習結束！得分：${score}/${questions.length}`);

      // 從完整題庫重抽一批新題
      applyQuestionCount(false);
      shuffle(questions);

      // 重置紀錄
      userChoices   = new Array(questions.length).fill(undefined);
      shownFeedback = new Array(questions.length).fill(false);

      // 歸零狀態
      index = 0;
      score = 0;
      document.getElementById('score').textContent = score;

      // 清 UI
      document.getElementById('progress').style.width = '0%';
      const fb = document.getElementById('feedback'); 
      if (fb) { fb.textContent = ''; fb.className = ''; }

      loadQuestion();
    }, 80);
    return;
  }
  loadQuestion();
}

/***********************
 *  小工具：洗牌
 ************************/
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/***********************
 *  小工具：題目 QID 產生器（用於去重 / 移除）
 ************************/
function getQid(q) {
  // 用「題幹 + 選項串」當作穩定簽章
  const sig = String(q?.q || '') + '||' + (Array.isArray(q?.options) ? q.options.join('|') : '');
  // 簡易 hash（非密碼學）
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/***********************
 * 集中管理錯題本：讀 / 寫（與記憶體同步）
 ************************/
function getWrongList() {
  try {
    const list = JSON.parse(localStorage.getItem(wKey()) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function setWrongList(list) {
  try { localStorage.setItem(wKey(), JSON.stringify(list)); }
  catch (e) { console.error('寫入錯題本失敗：', e); }
  wrongQuestions = list;  // 同步回記憶體
}

/***********************
 * 加入錯題本（避免重複）
 ************************/
function addWrong(q) {
  const qid = getQid(q);
  const list = getWrongList();
  
  // 檢查是否已在錯題本中，避免重複
  if (list.some(w => getQid(w) === qid)) {
    return;  // 已存在，不重複加入
  }
  
  list.push(q);
  setWrongList(list);
}

function removeWrongById(qid) {
  let list = getWrongList();
  list = list.filter(w => getQid(w) !== qid);
  setWrongList(list);
  renderWrongList();
}

/***********************
 * 重新抽題（給「重新抽題」按鈕用）
 ************************/
function reshuffleNewSet() {
  applyQuestionCount(false); // 依目前題數設定，從完整題庫重抽
  shuffle(questions);

  // 重置作答紀錄與狀態
  userChoices   = new Array(questions.length).fill(undefined);
  shownFeedback = new Array(questions.length).fill(false);

  index = 0;
  score = 0;
  document.getElementById('score').textContent = score;
  document.getElementById('progress').style.width = '0%';

  const fb = document.getElementById('feedback');
  if (fb) { fb.textContent = ''; fb.className = ''; }

  loadQuestion();
}


/***********************
 * 顯示錯題本 + 渲染列表
 ************************/
function showWrong() {
  showOnly('wrongBox');
  wrongQuestions = getWrongList();
  renderWrongList();
}
function renderWrongList() {
  const list = document.getElementById('wrongList');
  list.innerHTML = '';

  if (!Array.isArray(wrongQuestions) || wrongQuestions.length === 0) {
    const li = document.createElement('li');
    li.textContent = '目前沒有錯題 🎉';
    list.appendChild(li);
    return;
  }

  wrongQuestions.forEach((w, i) => {
    const qid = getQid(w);
    const li = document.createElement('li');
    li.className = 'wrong-item';

    li.innerHTML = `
      <div class="wrong-q">【${i + 1}】${w.q}</div>
      <div class="wrong-a">正解：${w.options[w.answer]}</div>
      <div class="wrong-ex">詳解：${w.explain || '無'}</div>
      <div class="wrong-actions">
        <button class="btn-secondary btn-sm" onclick="reviewThis('${qid}')">重做這題</button>
        <button class="btn-success btn-sm" onclick="removeWrongById('${qid}')">我學會了</button>
      </div>
    `;
    list.appendChild(li);
  });
}

/* 從錯題本直接重做該題（單題練習） */
function reviewThis(qid) {
  const target = getWrongList().find(w => getQid(w) === qid);
  if (!target) return alert('找不到這題，請重新整理錯題本');

  questions = [target];
  userChoices   = [undefined];
  shownFeedback = [false];
  index = 0; score = 0;
  document.getElementById('total').textContent = 1;
  document.getElementById('score').textContent = 0;
  document.getElementById('progress').style.width = '0%';
  const fb = document.getElementById('feedback'); if (fb) { fb.textContent=''; fb.className=''; }
  showOnly('quiz');
  loadQuestion();
}
function backToQuiz() {
  startQuiz();
}

/***********************
 * 重置（只清除此代碼）
 ************************/
function resetAll() {
  if (!currentKey) { alert('尚未登入題庫代碼'); return; }
  if (!confirm(`確定清除「${currentKey}」代碼下的題庫與錯題？`)) return;

  localStorage.removeItem(qKey());
  localStorage.removeItem(wKey());

  fullQuestions = [];
  wrongQuestions = [];
  questions = [];
  index = 0;
  score = 0;

  alert('已清除，請貼上新的題庫 JSON！');
  showOnly('setup');
}
