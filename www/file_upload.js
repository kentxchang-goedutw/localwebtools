// =========================================================
// 檔案上傳與即時錄音控制模組 (Upload & Audio Recorder Module)
// =========================================================

// 動態載入題號清單並套用至頁面中所有的題號 select
async function loadDynamicQuestions() {
  try {
    const res = await fetch('questions.txt?t=' + new Date().getTime());
    if (!res.ok) return;
    const text = await res.text();
    const questions = text.split('\n').map(q => q.trim()).filter(q => q.length > 0);
    if (questions.length === 0) return;

    // 支援所有名稱與 ID
    const selects = document.querySelectorAll(
      'select[name="question"], #question, #question_simple, #questionSimple, #question_audio, #questionAudio, #question_select, #questionSelect'
    );

    selects.forEach(selectElem => {
      if (selectElem) {
        const curVal = selectElem.value;
        selectElem.innerHTML = '';
        questions.forEach(q => {
          const opt = document.createElement('option');
          opt.value = q;
          opt.textContent = q;
          selectElem.appendChild(opt);
        });
        if (questions.includes(curVal)) {
          selectElem.value = curVal;
        }
      }
    });
  } catch (e) {
    console.warn('載入題號清單失敗:', e);
  }
}

document.addEventListener('DOMContentLoaded', loadDynamicQuestions);

// -----------------------------
// 顯示各 Modal
if (uploadButton) {
  uploadButton.onclick = function() {
    loadDynamicQuestions();
    uploadModal.style.display = "block";
  };
}

if (fileUploadButton) {
  fileUploadButton.onclick = function() {
    loadDynamicQuestions();
    fileUploadModal.style.display = "block";
  };
}

if (audioRecordButton) {
  audioRecordButton.onclick = function() {
    loadDynamicQuestions();
    audioRecordModal.style.display = "block";
    resetAudioRecording();
  };
}

// -----------------------------
// 切換上傳模式（即時畫布）
function chooseCanvas() {
  if (chosenMode === "upload") {
    document.getElementById("file").value = "";
    btnUpload.innerHTML = '🖼️ 選取圖片檔案';
  }
  chosenMode = "canvas";
  const questionValue = document.getElementById("question").value;
  loadBgForQuestion(questionValue);
  document.getElementById("uploadSection").style.display = "none";
  uploadModal.style.display = "none";
  fullCanvasMode.style.display = "block";
  document.body.style.overflow = "hidden";
  isEraserMode = false;
  initCanvas();
}

// -----------------------------
// 切換上傳模式（檔案上傳）
function chooseUpload() {
  if (chosenMode === "canvas") {
    canvasImageBase64 = null;
    uploadedBackgroundBase64 = null;
    btnCanvas.innerHTML = "🎨 開啟即時畫布";
    btnUpload.innerHTML = '🖼️ 選取圖片檔案';
  }
  chosenMode = "upload";
  document.getElementById("uploadSection").style.display = "block";
  fullCanvasMode.style.display = "none";
  document.body.style.overflow = "auto";
}

// -----------------------------
// 課堂繳交送出資料（上傳圖片模式 / 畫布模式）
function submitData() {
  resultDiv.innerHTML = "";
  uploadingMessage.style.display = "block";
  submitButton.disabled = true;
  
  const formData = new FormData(submissionForm);
  
  if (chosenMode === "canvas" && canvasImageBase64) {
    // 解除 file 輸入框的 required 屬性，避免瀏覽器阻擋提交
    document.getElementById("file").removeAttribute("required");
    
    // 將 canvasImageBase64 轉成 Blob
    let byteCharacters = atob(canvasImageBase64);
    let byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    let byteArray = new Uint8Array(byteNumbers);
    let blob = new Blob([byteArray], { type: "image/png" });
    
    let nameInput = document.getElementById("name");
    let discussionInput = document.getElementById("discussion");
    let baseName = nameInput.value.trim() || "canvas";
    let discussionText = discussionInput.value.trim();
    let canvasName = baseName;
    if (discussionText) {
      canvasName += "+" + discussionText;
    }
    if (!canvasName.toLowerCase().endsWith(".png")) {
      canvasName += ".png";
    }
    nameInput.value = canvasName;
    canvasFileNameDisplay.innerText = "檔案名稱：" + canvasName;
    formData.append("file", blob, canvasName);
  } else if (chosenMode === "upload") {
    appendFileExtension(formData);
  } else {
    resultDiv.innerHTML = "<p style='color:#E11D48; font-weight:bold;'>請先選擇並完成上傳方式（即時畫布或上傳檔案）。</p>";
    resetUI();
    return;
  }
  
  fetch('/upload', {
    method: 'POST',
    body: formData
  })
  .then(response => response.redirected ? window.location.href = response.url : response.text())
  .then(text => {
    resultDiv.innerHTML = "<p style='color:#059669; font-weight:bold;'>🎉 上傳成功！" + text + "</p>";
    submissionForm.reset();
    canvasFileNameDisplay.innerText = "";
    chosenMode = null;
    canvasImageBase64 = null;
    uploadedBackgroundBase64 = null;
    btnCanvas.innerHTML = "🎨 開啟即時畫布";
    btnUpload.innerHTML = '🖼️ 選取圖片檔案';
    resetUI();
    setTimeout(() => {
      closeUploadModal();
      loadDirectory(currentPath);
    }, 800);
  })
  .catch(error => {
    resultDiv.innerHTML = "<p style='color:#E11D48; font-weight:bold;'>上傳錯誤：" + error.message + "</p>";
    resetUI();
  });
}

function appendFileExtension(formData) {
  if (chosenMode === "upload") {
    const fileInput = document.getElementById("file");
    const nameInput = document.getElementById("name");
    let questionValue = "";
    const questionElem = document.getElementById("question");
    if (questionElem && questionElem.offsetParent !== null) {
      questionValue = questionElem.value;
    } else {
      questionValue = document.getElementById("question_simple").value;
    }
    formData.set("question", questionValue);
    
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      let inputName = nameInput.value.trim();
      if (!inputName) {
        inputName = "upload";
      }
      let newName = inputName + ".png";
      const fileExt = file.name.substring(file.name.lastIndexOf('.'));
      if (fileExt.toLowerCase() !== ".png") {
        newName = inputName + fileExt;
      }
      nameInput.value = newName;
      formData.set("name", newName);
      formData.delete("file");
      const renamedFile = new File([file], newName, { type: file.type });
      formData.append("file", renamedFile);
    }
  }
}

function resetUI() {
  uploadingMessage.style.display = "none";
  submitButton.disabled = false;
}

// -----------------------------
// 簡易檔案上傳（檔案上傳 Modal）
function submitSimpleData() {
  resultSimple.innerHTML = "";
  uploadingMessageSimple.style.display = "block";
  document.getElementById("submitButtonSimple").disabled = true;
  
  const formData = new FormData(fileUploadForm);
  const questionSimple = document.getElementById("question_simple").value;
  formData.set("question", questionSimple);
  
  const nameInputSimple = document.getElementById("name_simple");
  let baseName = nameInputSimple.value.trim();
  if (!baseName) {
    baseName = "upload";
  }
  
  const fileInputSimple = document.getElementById("file_simple");
  let file;
  if (fileInputSimple.files.length > 0) {
    file = fileInputSimple.files[0];
  } else if (droppedFile) {
    file = droppedFile;
  }
  if (file) {
    let newName = baseName;
    if (newName.indexOf('.') === -1) {
      const fileExt = file.name.substring(file.name.lastIndexOf('.'));
      newName += fileExt;
    }
    nameInputSimple.value = newName;
    formData.set("name", newName);
    formData.delete("file");
    const renamedFile = new File([file], newName, { type: file.type });
    formData.append("file", renamedFile);
  } else {
    resultSimple.innerHTML = "<p style='color:#E11D48; font-weight:bold;'>請先選擇檔案（可拖曳檔案至下方區域）。</p>";
    uploadingMessageSimple.style.display = "none";
    document.getElementById("submitButtonSimple").disabled = false;
    return;
  }
  
  fetch('/upload', {
    method: 'POST',
    body: formData
  })
  .then(response => response.redirected ? window.location.href = response.url : response.text())
  .then(text => {
    resultSimple.innerHTML = "<p style='color:#059669; font-weight:bold;'>🎉 上傳成功！" + text + "</p>";
    fileUploadForm.reset();
    droppedFile = null;
    dropZone.innerText = "📥 點擊或拖曳檔案至此區域上傳";
    document.getElementById("submitButtonSimple").disabled = false;
    uploadingMessageSimple.style.display = "none";
    setTimeout(() => {
      closeFileUploadModal();
      loadDirectory(currentPath);
    }, 800);
  })
  .catch(error => {
    resultSimple.innerHTML = "<p style='color:#E11D48; font-weight:bold;'>上傳錯誤：" + error.message + "</p>";
    document.getElementById("submitButtonSimple").disabled = false;
    uploadingMessageSimple.style.display = "none";
  });
}

if (dropZone) {
  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.backgroundColor = '#E0F2FE';
  });
  dropZone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.backgroundColor = '';
  });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.backgroundColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      droppedFile = e.dataTransfer.files[0];
      dropZone.innerText = "✅ 已選擇: " + droppedFile.name;
      document.getElementById("file_simple").value = "";
      e.dataTransfer.clearData();
    }
  });
}

// =========================================================
// 線上語音錄音與直接上傳功能 (相容 iPadOS / iOS / 各大瀏覽器)
// =========================================================

let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let recordTimerInterval = null;
let recordSeconds = 0;
let audioMimeType = '';

// 取得適用的音訊 MIME 格式
function getSupportedAudioMimeType() {
  const types = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/aac',
    'audio/ogg;codecs=opus',
    'audio/wav'
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (let t of types) {
    if (MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}

// 檢查是否支援 WebRTC 錄音，若不支援則自動啟用原生錄音降級模式
function checkAudioRecordingSupport() {
  const isWebRTCSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const btnStart = document.getElementById("btnStartRecord");
  const btnNative = document.getElementById("btnNativeRecord");
  const tip = document.getElementById("audioCompatibilityTip");

  if (!isWebRTCSupported) {
    if (btnStart) btnStart.style.display = "none";
    if (btnNative) btnNative.style.display = "inline-flex";
    if (tip) tip.style.display = "block";
  } else {
    if (btnStart) btnStart.style.display = "inline-flex";
    if (btnNative) btnNative.style.display = "none";
    if (tip) tip.style.display = "none";
  }
}

// 觸發 iPad / 系統原生錄音或選檔
function triggerNativeAudioRecording() {
  const nativeInput = document.getElementById("nativeAudioInput");
  if (nativeInput) {
    nativeInput.value = "";
    nativeInput.click();
  }
}

// 將 AudioBuffer 編碼為標準 PCM WAV Blob
function audioBufferToWav(buffer) {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const interleaved = new Float32Array(left.length + right.length);
    for (let src = 0, dst = 0; src < left.length; src++, dst += 2) {
      interleaved[dst] = left[src];
      interleaved[dst + 1] = right[src];
    }
    result = interleaved;
  } else {
    result = buffer.getChannelData(0);
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteCount = result.length * bytesPerSample;
  const wavBuffer = new ArrayBuffer(44 + dataByteCount);
  const view = new DataView(wavBuffer);

  function writeString(v, offset, str) {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteCount, true);
  writeString(view, 8, 'WAVE');
  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteCount, true);

  // 寫入 PCM 音訊數據
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

// 自動從影片（如 iPad 的 .mov / .mp4）中解碼並抽取純聲音
async function extractAudioFromFile(file) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return file;

  try {
    const audioCtx = new AudioContextClass();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWav(audioBuffer);
    wavBlob.name = file.name.replace(/\.[^/.]+$/, "") + ".wav";
    return wavBlob;
  } catch (err) {
    console.warn("音訊解碼失敗，保留原檔案：", err);
    return file;
  }
}

// 處理原生錄音 / 影片選取完成
async function handleNativeAudioSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const statusText = document.getElementById("recordStatusText");
  const submitBtn = document.getElementById("submitButtonAudio");
  const isVideo = file.type.startsWith("video/") || /\.(mov|mp4|m4v|3gp|avi|mkv)$/i.test(file.name);

  if (isVideo) {
    if (statusText) statusText.innerText = "🔄 正在從影片中分離純聲音，請稍候...";
    if (submitBtn) submitBtn.disabled = true;
    
    // 抽取純聲音
    audioBlob = await extractAudioFromFile(file);
    if (statusText) statusText.innerText = `🎉 已成功分離純聲音 (${Math.round(audioBlob.size / 1024)} KB)`;
  } else {
    audioBlob = file;
    if (statusText) statusText.innerText = `已載入音訊：${file.name}`;
  }

  const audioUrl = URL.createObjectURL(audioBlob);
  const audioPreview = document.getElementById("audioPreview");
  if (audioPreview) {
    audioPreview.src = audioUrl;
    audioPreview.style.display = "block";
  }

  if (submitBtn) submitBtn.disabled = false;
}

// 開始錄音
async function startAudioRecording() {
  const resultAudio = document.getElementById("resultAudio");
  resultAudio.innerHTML = "";
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    // 自動降級切換至原生錄音
    triggerNativeAudioRecording();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    audioMimeType = getSupportedAudioMimeType();
    
    const options = audioMimeType ? { mimeType: audioMimeType } : {};
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = function() {
      // 停止麥克風串流
      stream.getTracks().forEach(track => track.stop());
      
      const typeToUse = mediaRecorder.mimeType || audioMimeType || 'audio/mp4';
      audioBlob = new Blob(audioChunks, { type: typeToUse });
      
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioPreview = document.getElementById("audioPreview");
      audioPreview.src = audioUrl;
      audioPreview.style.display = "block";
      
      document.getElementById("submitButtonAudio").disabled = false;
      document.getElementById("recordStatusText").innerText = "錄音完成，可試聽或送出";
      document.getElementById("recordingDot").classList.remove("active");
    };

    mediaRecorder.start(200); // 每 200ms 收集一次 chunk

    // 更新介面狀態
    document.getElementById("btnStartRecord").style.display = "none";
    document.getElementById("btnStopRecord").style.display = "inline-flex";
    document.getElementById("btnResetRecord").style.display = "none";
    document.getElementById("recordingDot").classList.add("active");
    document.getElementById("recordStatusText").innerText = "錄音中...";
    document.getElementById("audioPreview").style.display = "none";
    document.getElementById("submitButtonAudio").disabled = true;

    // 開始計時
    recordSeconds = 0;
    updateTimerDisplay();
    clearInterval(recordTimerInterval);
    recordTimerInterval = setInterval(() => {
      recordSeconds++;
      updateTimerDisplay();
    }, 1000);

  } catch (err) {
    console.error("麥克風存取失敗：", err);
    // 若存取失敗則提供原生錄音作為備援
    triggerNativeAudioRecording();
  }
}

// 停止錄音
function stopAudioRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  clearInterval(recordTimerInterval);
  document.getElementById("btnStopRecord").style.display = "none";
  document.getElementById("btnResetRecord").style.display = "inline-flex";
  document.getElementById("btnStartRecord").style.display = "none";
}

// 重置錄音
function resetAudioRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  clearInterval(recordTimerInterval);
  audioChunks = [];
  audioBlob = null;
  recordSeconds = 0;
  
  const timerDisplay = document.getElementById("recordTimerDisplay");
  if (timerDisplay) timerDisplay.innerText = "00:00";
  
  const recordingDot = document.getElementById("recordingDot");
  if (recordingDot) recordingDot.classList.remove("active");
  
  const recordStatusText = document.getElementById("recordStatusText");
  if (recordStatusText) recordStatusText.innerText = "準備就緒";
  
  const audioPreview = document.getElementById("audioPreview");
  if (audioPreview) {
    audioPreview.src = "";
    audioPreview.style.display = "none";
  }
  
  checkAudioRecordingSupport();
  
  const btnStopRecord = document.getElementById("btnStopRecord");
  if (btnStopRecord) btnStopRecord.style.display = "none";
  
  const btnResetRecord = document.getElementById("btnResetRecord");
  if (btnResetRecord) btnResetRecord.style.display = "none";
  
  const submitButtonAudio = document.getElementById("submitButtonAudio");
  if (submitButtonAudio) submitButtonAudio.disabled = true;

  const resultAudio = document.getElementById("resultAudio");
  if (resultAudio) resultAudio.innerHTML = "";
  
  const uploadingMessageAudio = document.getElementById("uploadingMessageAudio");
  if (uploadingMessageAudio) uploadingMessageAudio.style.display = "none";
}

// 計時器顯示格式化
function updateTimerDisplay() {
  const mins = Math.floor(recordSeconds / 60);
  const secs = recordSeconds % 60;
  const timerDisplay = document.getElementById("recordTimerDisplay");
  if (timerDisplay) {
    timerDisplay.innerText = 
      (mins < 10 ? "0" + mins : mins) + ":" + (secs < 10 ? "0" + secs : secs);
  }
}

// 上傳錄音檔案
function submitAudioData() {
  const resultAudio = document.getElementById("resultAudio");
  const uploadingMessageAudio = document.getElementById("uploadingMessageAudio");
  const submitButtonAudio = document.getElementById("submitButtonAudio");
  
  resultAudio.innerHTML = "";
  
  if (!audioBlob) {
    resultAudio.innerHTML = "<p style='color:#E11D48; font-weight:bold;'>尚未錄製音訊，請先進行錄音。</p>";
    return;
  }

  const nameInput = document.getElementById("name_audio");
  let studentName = nameInput.value.trim();
  if (!studentName) {
    resultAudio.innerHTML = "<p style='color:#E11D48; font-weight:bold;'>請輸入學生姓名或座號！</p>";
    nameInput.focus();
    return;
  }

  const questionSelect = document.getElementById("question_audio");
  const questionValue = questionSelect.value;

  // 判斷副檔名（影片格式一律輸出為 .wav 純音訊）
  let ext = '.wav';
  if (audioBlob.name && audioBlob.name.lastIndexOf('.') !== -1) {
    const rawExt = audioBlob.name.substring(audioBlob.name.lastIndexOf('.')).toLowerCase();
    if (['.mov', '.mp4', '.m4v', '.avi', '.3gp'].includes(rawExt)) {
      ext = '.wav';
    } else {
      ext = rawExt;
    }
  } else {
    const type = audioBlob.type || '';
    if (type.includes('wav')) {
      ext = '.wav';
    } else if (type.includes('webm')) {
      ext = '.webm';
    } else if (type.includes('ogg')) {
      ext = '.ogg';
    } else if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) {
      ext = '.m4a';
    }
  }

  let finalFileName = studentName;
  if (!finalFileName.toLowerCase().endsWith(ext)) {
    finalFileName += ext;
  }

  const audioFile = new File([audioBlob], finalFileName, { type: audioBlob.type || 'audio/mp4' });

  const formData = new FormData();
  formData.append("question", questionValue);
  formData.append("name", finalFileName);
  formData.append("file", audioFile);

  uploadingMessageAudio.style.display = "block";
  submitButtonAudio.disabled = true;

  fetch('/upload', {
    method: 'POST',
    body: formData
  })
  .then(response => response.redirected ? window.location.href = response.url : response.text())
  .then(text => {
    resultAudio.innerHTML = "<p style='color:#059669; font-weight:bold;'>🎉 錄音作業上傳成功！" + text + "</p>";
    uploadingMessageAudio.style.display = "none";
    submitButtonAudio.disabled = false;
    setTimeout(() => {
      closeAudioRecordModal();
      loadDirectory(currentPath);
    }, 1000);
  })
  .catch(err => {
    resultAudio.innerHTML = "<p style='color:#E11D48; font-weight:bold;'>上傳失敗：" + err.message + "</p>";
    uploadingMessageAudio.style.display = "none";
    submitButtonAudio.disabled = false;
  });
}
