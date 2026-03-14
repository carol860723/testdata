/***********************
 *  代碼分庫 + 狀態（全域）
 ************************/
let currentKey = null;
let fullQuestions = [];   // 此代碼完整題庫
let questions = [];       // 本次練習題目
let wrongQuestions = [];  // 錯題本
let index = 0, score = 0;

/* 模擬考相關 */
let mockExamActive = false;     // 是否正在進行模擬考
let mockQuestions = [];          // 模擬考題目
let mockIndex = 0;              // 當前題目索引
let mockScore = 0;              // 模擬考分數
let mockChoices = [];           // 模擬考答題記錄
let mockFeedback = [];          // 模擬考回饋記錄
let mockPassScore = 60;         // 及格分數
let mockTimeLeft = 40 * 60;     // 剩餘秒數（40分鐘）
let mockTimerId = null;         // 計時器ID

/* 作答紀錄（回上一題需要） */
let userChoices   = [];   // 每題使用者選了哪個選項（index），沒答過 = undefined
let shownFeedback = [];   // 每題是否已顯示回饋（true/false）

/* LocalStorage key helpers */
const bankKeyStore = 'quiz_bank_key';
const qKey = () => `myQuestions_${currentKey}`;
const wKey = () => `wrongList_${currentKey}`;
const punchtimeKey = () => `punchtime_${currentKey}`;

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
  ['keyLabel_setup','keyLabel_quiz','keyLabel_wrong','keyLabel_punchtime'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.textContent = currentKey || '-';
  });
}
function showOnly(which) {
  ['login','setup','quiz','wrongBox','punchtimeBox'].forEach(id=>{
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
  
  // 確保顯示普通練習模式
  const normalDiv = document.getElementById('normalMode');
  const mockDiv = document.getElementById('mockMode');
  if (normalDiv) normalDiv.style.display = 'block';
  if (mockDiv) mockDiv.style.display = 'none';
  
  // 更新模式按鈕
  document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
  const normalBtn = document.querySelector('.mode-btn');
  if (normalBtn) normalBtn.classList.add('active');

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
 * 加入錯題本（計數版本）
 ************************/
function addWrong(q) {
  const qid = getQid(q);
  const list = getWrongList();
  
  // 檢查是否已在錯題本中
  const existing = list.find(w => getQid(w) === qid);
  
  if (existing) {
    // 已存在，增加計數
    existing.wrongCount = (existing.wrongCount || 1) + 1;
  } else {
    // 新增到錯題本，計數初始為1
    q.wrongCount = 1;
    list.push(q);
  }
  
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
  // 重置錯題練習
  document.getElementById('reviewMode').style.display = 'block';
  document.getElementById('practiceMode').style.display = 'none';
  document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.method-btn')[0].classList.add('active');
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
    const wrongCount = w.wrongCount || 1;
    const countLabel = wrongCount > 1 ? `<span style="color:#ff4f4f; font-weight:700;">× ${wrongCount}</span>` : '';

    li.innerHTML = `
      <div class="wrong-q">【${i + 1}】${w.q} ${countLabel}</div>
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

/***********************
 * 錯題練習模式
 ************************/
let wrongPracticeQuestions = []; // 錯題練習的題目集
let wrongPracticeIndex = 0;
let wrongPracticeScore = 0;
let wrongPracticeChoices = [];
let wrongPracticeFeedback = [];

function switchWrongMode(mode) {
  // 更新按鈕狀態
  document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  const reviewDiv = document.getElementById('reviewMode');
  const practiceDiv = document.getElementById('practiceMode');

  if (mode === 'review') {
    reviewDiv.style.display = 'block';
    practiceDiv.style.display = 'none';
  } else if (mode === 'practice') {
    reviewDiv.style.display = 'none';
    practiceDiv.style.display = 'block';
    applyWrongPracticeMode(false);
  }
}

function applyWrongPracticeMode(fromUser = false) {
  const sel = document.getElementById('practiceMode_select');
  const v = sel ? sel.value : 'all';

  const allWrong = getWrongList();
  let pool = [];

  if (v === 'all') {
    pool = [...allWrong];
  } else if (v === '3plus') {
    pool = allWrong.filter(q => (q.wrongCount || 1) >= 3);
  } else if (v === '5plus') {
    pool = allWrong.filter(q => (q.wrongCount || 1) >= 5);
  }

  if (pool.length === 0) {
    alert('此篩選條件下沒有錯題');
    return;
  }

  shuffle(pool);
  wrongPracticeQuestions = pool;

  if (fromUser) {
    wrongPracticeIndex = 0;
    wrongPracticeScore = 0;
    wrongPracticeChoices = new Array(wrongPracticeQuestions.length).fill(undefined);
    wrongPracticeFeedback = new Array(wrongPracticeQuestions.length).fill(false);

    document.getElementById('practice-score').textContent = wrongPracticeScore;
    document.getElementById('practice-progress').style.width = '0%';
    const fb = document.getElementById('practice-feedback'); if (fb) { fb.textContent=''; fb.className=''; }
  }

  document.getElementById('practice-total').textContent = wrongPracticeQuestions.length;
  loadWrongPracticeQuestion();
}

function loadWrongPracticeQuestion() {
  if (!wrongPracticeQuestions.length) { alert('暫無錯題'); return; }
  const q = wrongPracticeQuestions[wrongPracticeIndex];

  // 進度 / 題幹
  document.getElementById('practice-progress').style.width = `${(wrongPracticeIndex / wrongPracticeQuestions.length) * 100}%`;
  document.getElementById('practice-current').textContent = wrongPracticeIndex + 1;
  document.getElementById('practice-question').textContent = q.q;

  // 選項
  const box = document.getElementById('practice-options'); box.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn fade';
    btn.textContent = opt;
    btn.onclick = () => checkWrongPracticeAnswer(i);
    box.appendChild(btn);
  });

  // 回饋狀態
  const fb = document.getElementById('practice-feedback');
  const btns = document.querySelectorAll('#practice-options .option-btn');

  if (wrongPracticeFeedback[wrongPracticeIndex]) {
    const chosen = wrongPracticeChoices[wrongPracticeIndex];

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

function checkWrongPracticeAnswer(choice) {
  const q = wrongPracticeQuestions[wrongPracticeIndex];
  const fb = document.getElementById('practice-feedback');
  const btns = document.querySelectorAll('#practice-options .option-btn');

  // 記錄作答
  wrongPracticeChoices[wrongPracticeIndex] = choice;
  wrongPracticeFeedback[wrongPracticeIndex] = true;

  // 顯示回饋
  if (choice === q.answer) {
    fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'correct';
    wrongPracticeScore++; 
    document.getElementById('practice-score').textContent = wrongPracticeScore;
  } else {
    fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'incorrect';
    // 再錯一次，增加wrongCount
    const qid = getQid(q);
    const list = getWrongList();
    const existing = list.find(w => getQid(w) === qid);
    if (existing) {
      existing.wrongCount = (existing.wrongCount || 1) + 1;
      setWrongList(list);
    }
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

function practiceBackQuestion() {
  if (wrongPracticeIndex <= 0) return;
  wrongPracticeIndex--;
  loadWrongPracticeQuestion();
}

function practiceNextQuestion() {
  wrongPracticeIndex++;
  if (wrongPracticeIndex >= wrongPracticeQuestions.length) {
    document.getElementById('practice-progress').style.width = '100%';
    setTimeout(() => {
      alert(`練習結束！得分：${wrongPracticeScore}/${wrongPracticeQuestions.length}`);
      switchWrongMode('review');
      wrongQuestions = getWrongList();
      renderWrongList();
    }, 80);
    return;
  }
  loadWrongPracticeQuestion();
}

function backToWrongList() {
  switchWrongMode('review');
}
function backToQuiz() {
  if (mockExamActive && mockTimerId) {
    clearInterval(mockTimerId);
    mockExamActive = false;
  }
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

/***********************
 * 測驗模式切換（普通練習 vs 模擬考）
 ************************/
function switchQuizMode(mode) {
  // 更新按鈕狀態
  document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  const normalDiv = document.getElementById('normalMode');
  const mockDiv = document.getElementById('mockMode');

  if (mode === 'normal') {
    normalDiv.style.display = 'block';
    mockDiv.style.display = 'none';
    if (mockExamActive) {
      if (mockTimerId) clearInterval(mockTimerId);
      mockExamActive = false;
    }
  } else if (mode === 'mock') {
    normalDiv.style.display = 'none';
    mockDiv.style.display = 'block';
    document.getElementById('mockSetup').style.display = 'block';
    document.getElementById('mockExam').style.display = 'none';
    document.getElementById('mockResult').style.display = 'none';
  }
}

/***********************
 * 模擬考試邏輯
 ************************/
function startMockExam() {
  const numInput = document.getElementById('mockQuestionNum').value;
  const passInput = document.getElementById('mockPassScore').value;

  let num = parseInt(numInput, 10);
  let pass = parseInt(passInput, 10);

  // 驗證輸入
  if (num < 1 || num > fullQuestions.length) {
    alert(`考題數量應在 1 ~ ${fullQuestions.length} 之間`);
    return;
  }
  if (pass < 10 || pass > 90) {
    alert('及格分數應在 10 ~ 90 之間');
    return;
  }

  // 初始化模擬考
  mockExamActive = true;
  mockPassScore = pass;
  const pool = [...fullQuestions];
  shuffle(pool);
  mockQuestions = pool.slice(0, num);

  mockIndex = 0;
  mockScore = 0;
  mockChoices = new Array(mockQuestions.length).fill(undefined);
  mockFeedback = new Array(mockQuestions.length).fill(false);
  mockTimeLeft = 40 * 60; // 40 分鐘

  // 更新 UI
  document.getElementById('mockSetup').style.display = 'none';
  document.getElementById('mockExam').style.display = 'block';
  document.getElementById('mockResult').style.display = 'none';
  document.getElementById('mockTotal').textContent = mockQuestions.length;
  document.getElementById('mockPassLabel').textContent = mockPassScore;

  // 開始計時
  startMockTimer();

  // 加載第一題
  loadMockQuestion();
}

function startMockTimer() {
  if (mockTimerId) clearInterval(mockTimerId);

  mockTimerId = setInterval(() => {
    mockTimeLeft--;

    const mins = Math.floor(mockTimeLeft / 60);
    const secs = mockTimeLeft % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    document.getElementById('mockTimer').textContent = timeStr;

    // 時間不足5分鐘時閃爍警告
    const timerEl = document.getElementById('mockTimer');
    if (mockTimeLeft <= 300 && mockTimeLeft > 0) {
      timerEl.classList.add('warn');
    } else {
      timerEl.classList.remove('warn');
    }

    // 時間結束自動提交
    if (mockTimeLeft <= 0) {
      clearInterval(mockTimerId);
      alert('時間已到，自動提交答卷');
      submitMockExam();
    }
  }, 1000);
}

function loadMockQuestion() {
  if (mockIndex < 0 || mockIndex >= mockQuestions.length) return;

  const q = mockQuestions[mockIndex];

  // 進度
  document.getElementById('mockProgress').style.width = `${(mockIndex / mockQuestions.length) * 100}%`;
  document.getElementById('mockCurrent').textContent = mockIndex + 1;
  document.getElementById('mockQuestion').textContent = q.q;

  // 選項
  const box = document.getElementById('mockOptions'); box.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn fade';
    btn.textContent = opt;
    btn.onclick = () => checkMockAnswer(i);
    box.appendChild(btn);
  });

  // 回饋
  const fb = document.getElementById('mockFeedback');
  const btns = document.querySelectorAll('#mockOptions .option-btn');

  if (mockFeedback[mockIndex]) {
    const chosen = mockChoices[mockIndex];

    if (chosen === q.answer) {
      fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
      fb.className = 'correct';
    } else {
      fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
      fb.className = 'incorrect';
    }

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

  // 更新分數顯示
  document.getElementById('mockScore').textContent = mockScore;
}

function checkMockAnswer(choice) {
  const q = mockQuestions[mockIndex];
  const fb = document.getElementById('mockFeedback');
  const btns = document.querySelectorAll('#mockOptions .option-btn');

  mockChoices[mockIndex] = choice;
  mockFeedback[mockIndex] = true;

  if (choice === q.answer) {
    fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'correct';
    mockScore += 10;
    document.getElementById('mockScore').textContent = mockScore;
  } else {
    fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'incorrect';
    // 加入錯題本
    addWrong(q);
  }

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

function mockPrevQuestion() {
  if (mockIndex <= 0) return;
  mockIndex--;
  loadMockQuestion();
}

function mockNextQuestion() {
  mockIndex++;
  if (mockIndex >= mockQuestions.length) {
    mockIndex = mockQuestions.length - 1;
  }
  loadMockQuestion();
}

function submitMockExam() {
  if (!confirm('確定要提交答卷嗎？提交後無法再修改。')) return;

  // 停止計時
  if (mockTimerId) clearInterval(mockTimerId);

  const isPassed = mockScore >= mockPassScore;
  const usedSeconds = 40 * 60 - mockTimeLeft;
  const mins = Math.floor(usedSeconds / 60);
  const secs = usedSeconds % 60;

  // 保存打卡紀錄
  if (isPassed) {
    savePunchtime({
      date: new Date().toLocaleString('zh-TW'),
      score: mockScore,
      total: mockQuestions.length * 10,
      passScore: mockPassScore,
      timeUsed: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    });
  }

  // 顯示結果
  const resultDiv = document.getElementById('mockResult');
  let resultHTML = '<div id="resultContent">';
  resultHTML += `<h2>模擬考試結束</h2>`;
  resultHTML += `<div class="result-score ${isPassed ? 'pass' : 'fail'}">${mockScore}</div>`;
  resultHTML += `<div class="result-detail">`;
  resultHTML += `<p>答對題數：${Math.floor(mockScore / 10)} / ${mockQuestions.length} 題</p>`;
  resultHTML += `<p>及格分數：${mockPassScore} 分</p>`;
  resultHTML += `<p>考試用時：${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}</p>`;

  if (isPassed) {
    resultHTML += `<div class="punchtime-badge">✓ 及格！已打卡</div>`;
  } else {
    resultHTML += `<p style="color:#ff4f4f; font-weight:600;">尚未及格，請繼續努力</p>`;
  }

  resultHTML += `</div>`;
  resultHTML += `<div class="result-buttons">`;
  resultHTML += `<button class="btn" onclick="switchQuizMode('mock')">重新考試</button>`;
  resultHTML += `<button class="btn-secondary" onclick="switchQuizMode('normal')">返回練習</button>`;
  if (isPassed) {
    resultHTML += `<button class="btn-warning" onclick="showPunchtime()">查看打卡記錄</button>`;
  }
  resultHTML += `</div>`;
  resultHTML += `</div>`;

  resultDiv.innerHTML = resultHTML;

  document.getElementById('mockSetup').style.display = 'none';
  document.getElementById('mockExam').style.display = 'none';
  document.getElementById('mockResult').style.display = 'block';

  mockExamActive = false;
}

/***********************
 * 打卡紀錄管理
 ************************/
function savePunchtime(record) {
  try {
    const list = JSON.parse(localStorage.getItem(punchtimeKey()) || '[]');
    list.push(record);
    localStorage.setItem(punchtimeKey(), JSON.stringify(list));
  } catch (e) {
    console.error('保存打卡紀錄失敗：', e);
  }
}

function getPunchtimeList() {
  try {
    const list = JSON.parse(localStorage.getItem(punchtimeKey()) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function showPunchtime() {
  showOnly('punchtimeBox');
  renderPunchtimeList();
}

function renderPunchtimeList() {
  const list = document.getElementById('punchtimeList');
  const records = getPunchtimeList();

  list.innerHTML = '';

  if (records.length === 0) {
    const li = document.createElement('li');
    li.textContent = '目前沒有打卡記錄';
    list.appendChild(li);
    return;
  }

  records.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'punchtime-item';
    li.innerHTML = `
      <div class="punchtime-info">【第 ${i + 1} 次】${r.date}</div>
      <div class="punchtime-score">分數：${r.score} / ${r.total} (及格線：${r.passScore})</div>
      <div class="punchtime-info">用時：${r.timeUsed}</div>
    `;
    list.appendChild(li);
  });
}

/***********************
 * 輸入方式切換（貼上 vs 匯入檔案）
 ************************/
function switchMethod(method) {
  // 更新按鈕狀態
  document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  // 切換顯示的方法部分
  const pasteDiv = document.getElementById('pasteMethod');
  const fileDiv = document.getElementById('fileMethod');

  if (method === 'paste') {
    pasteDiv.style.display = 'block';
    fileDiv.style.display = 'none';
  } else if (method === 'file') {
    pasteDiv.style.display = 'none';
    fileDiv.style.display = 'block';
    // 重置檔案輸入狀態
    document.getElementById('jsonFile').value = '';
    document.getElementById('fileStatus').textContent = '';
    document.getElementById('submitFileBtn').style.display = 'none';
  }
}

/***********************
 * 檔案匯入功能
 ************************/
function loadFromFile() {
  const fileInput = document.getElementById('jsonFile');
  const file = fileInput.files[0];
  const fileStatus = document.getElementById('fileStatus');

  if (!file) {
    fileStatus.textContent = '⚠️ 請選擇檔案';
    document.getElementById('submitFileBtn').style.display = 'none';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target.result;
      const parsed = JSON.parse(content);

      // 基礎驗證
      if (!Array.isArray(parsed) || !parsed.length) {
        fileStatus.textContent = '❌ 檔案必須包含非空的 JSON 陣列';
        document.getElementById('submitFileBtn').style.display = 'none';
        return;
      }

      // 逐題檢查格式
      for (let i = 0; i < parsed.length; i++) {
        const t = parsed[i];
        if (!t.q || !Array.isArray(t.options) || typeof t.answer !== 'number') {
          fileStatus.textContent = `❌ 第 ${i+1} 題格式須含 q / options[] / answer`;
          document.getElementById('submitFileBtn').style.display = 'none';
          return;
        }
        if (t.answer < 0 || t.answer >= t.options.length) {
          fileStatus.textContent = `❌ 第 ${i+1} 題 answer 超出選項範圍`;
          document.getElementById('submitFileBtn').style.display = 'none';
          return;
        }
      }

      // 驗證成功
      fileStatus.innerHTML = `✅ 檔案有效！共 ${parsed.length} 題`;
      document.getElementById('submitFileBtn').style.display = 'block';
      
      // 保存到臨時變數備用
      window.pendingQuestions = parsed;
    } catch (e) {
      fileStatus.textContent = '❌ JSON 解析失敗，請確認檔案格式';
      document.getElementById('submitFileBtn').style.display = 'none';
      console.error(e);
    }
  };

  reader.onerror = () => {
    fileStatus.textContent = '❌ 檔案讀取失敗';
    document.getElementById('submitFileBtn').style.display = 'none';
  };

  reader.readAsText(file);
}

function saveQuestionsFromFile() {
  if (!currentKey) { alert('請先輸入題庫代碼'); return; }
  if (!window.pendingQuestions) { alert('請先選擇並驗證檔案'); return; }

  try {
    fullQuestions = window.pendingQuestions;
    wrongQuestions = [];
    localStorage.setItem(qKey(), JSON.stringify(fullQuestions));
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));

    alert(`題庫已儲存！共 ${fullQuestions.length} 題`);
    window.pendingQuestions = null;
    startQuiz();
  } catch (e) {
    console.error(e);
    alert('保存失敗，請重試');
  }
}

/***********************
 * 下載範例 JSON
 ************************/
function downloadExample() {
  const exampleData = [
    {
      "q": "2 + 2 = ?",
      "options": ["2", "3", "4", "5"],
      "answer": 2,
      "explain": "基本加法，2+2 等於 4"
    },
    {
      "q": "台灣的首都是？",
      "options": ["新北市", "台北市", "台中市", "高雄市"],
      "answer": 1,
      "explain": "台灣的首都和政治中心是台北市"
    },
    {
      "q": "以下哪個是程式語言？",
      "options": ["HTML", "CSS", "JavaScript", "以上皆是"],
      "answer": 3,
      "explain": "HTML、CSS 和 JavaScript 都是前端開發語言"
    }
  ];

  const jsonString = JSON.stringify(exampleData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'example_questions.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
