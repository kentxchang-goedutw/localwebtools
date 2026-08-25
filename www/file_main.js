// -----------------------------
// Global 變數設定
let showHiddenFiles = false;
let currentPath = '';
let chosenMode = null; // "canvas" 或 "upload"
let canvasImageBase64 = null;
let isDrawing = false;
let currentColor = "#0000ff";
let currentSize = 5;
let isEraserMode = false;
let uploadedBackgroundBase64 = null;
let droppedFile = null;

let bgCanvas, drawCanvas, bgCtx, drawCtx;

// 取得常用 DOM 參照
const uploadButton = document.getElementById("uploadButton");
const fileUploadButton = document.getElementById("fileUploadButton");
const audioRecordButton = document.getElementById("audioRecordButton");
const uploadModal = document.getElementById("uploadModal");
const fileUploadModal = document.getElementById("fileUploadModal");
const audioRecordModal = document.getElementById("audioRecordModal");
const submissionForm = document.getElementById("submissionForm");
const fullCanvasMode = document.getElementById("fullCanvasMode");
const uploadingMessage = document.getElementById("uploadingMessage");
const submitButton = document.getElementById("submitButton");
const resultDiv = document.getElementById("result");
const btnCanvas = document.getElementById("btnCanvas");
const btnUpload = document.getElementById("btnUpload");
const uploadBackgroundBtn = document.getElementById("uploadBackgroundBtn");
const backgroundImageInput = document.getElementById("backgroundImageInput");
const canvasFileNameDisplay = document.getElementById("canvasFileNameDisplay");
const fileUploadForm = document.getElementById("fileUploadForm");
const resultSimple = document.getElementById("resultSimple");
const uploadingMessageSimple = document.getElementById("uploadingMessageSimple");
const dropZone = document.getElementById("dropZone");

// -----------------------------
// 載入背景圖片（依題號）
function loadBgForQuestion(questionValue) {
  if (!questionValue) return;
  const exts = ["png", "jpg", "jpeg", "webp"];
  const nameCandidates = [];

  // 1. 原題號名稱 (如 數學作業.png, 問題1.png)
  nameCandidates.push(questionValue);

  // 2. 加上 q 前綴 (如 q數學作業.png, q自由創作.png)
  nameCandidates.push("q" + questionValue);

  // 3. 問題X 轉為 qX (如 問題1 -> q1, 問題2 -> q2)
  if (questionValue.includes("問題")) {
    nameCandidates.push(questionValue.replace("問題", "q"));
    nameCandidates.push(questionValue.replace("問題", ""));
  }

  // 4. 包含數字提取 (如 1 -> q1)
  const numMatch = questionValue.match(/\d+/);
  if (numMatch) {
    nameCandidates.push("q" + numMatch[0]);
  }

  // 組合所有可能的 URL
  const urls = [];
  const added = new Set();
  nameCandidates.forEach(name => {
    exts.forEach(ext => {
      const u1 = "bg/" + encodeURIComponent(name) + "." + ext;
      const u2 = "bg/" + name + "." + ext;
      if (!added.has(u1)) { added.add(u1); urls.push(u1); }
      if (!added.has(u2)) { added.add(u2); urls.push(u2); }
    });
  });

  function tryLoad(index) {
    if (index >= urls.length) {
      console.log("此題目尚未設定背景圖：" + questionValue);
      uploadedBackgroundBase64 = null;
      if (bgCtx) {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
      }
      return;
    }
    const currentUrl = urls[index] + "?t=" + new Date().getTime();
    fetch(currentUrl, { cache: "reload" })
      .then(response => {
        if (!response.ok) {
          tryLoad(index + 1);
          return;
        }
        return response.blob();
      })
      .then(blob => {
        if (!blob) return;
        let reader = new FileReader();
        reader.onload = function(e) {
          uploadedBackgroundBase64 = e.target.result.split(",")[1];
          if (bgCtx) {
            renderBackground();
          }
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {
        tryLoad(index + 1);
      });
  }

  tryLoad(0);
}

// 監聽題號變更以即時更新畫布背景
document.addEventListener("DOMContentLoaded", function() {
  const qSelect = document.getElementById("question");
  if (qSelect) {
    qSelect.addEventListener("change", function() {
      if (chosenMode === "canvas") {
        loadBgForQuestion(this.value);
      }
    });
  }
});

// -----------------------------
// 檔案總管目錄載入函式
function loadDirectory(path) {
  currentPath = path || '';
  const normalizedPath = (currentPath).replace(/^[\\\/]+|[\\\/]+$/g, '').trim();
  const isRoot = (normalizedPath === '');

  fetch('/api/list?path=' + encodeURIComponent(normalizedPath) + '&t=' + new Date().getTime())
    .then(response => response.json())
    .then(data => {
      if (isRoot) {
        if (!showHiddenFiles) {
          // 學生未解鎖模式：根目錄只呈現 html 教材資料夾
          data = data.filter(item => Boolean(item.isDir) && item.name.toLowerCase() === 'html');
        } else {
          // 教師解鎖模式：根目錄嚴格只呈現「資料夾」以及「.html / .htm 檔案」
          data = data.filter(item => {
            if (item.isDir) return true;
            const lowerName = (item.name || '').toLowerCase();
            return lowerName.endsWith('.html') || lowerName.endsWith('.htm');
          });
        }
      }
      // 其他子目錄 (isRoot === false) 呈現所有類型檔案，不予限制
      const explorer = document.getElementById('file-explorer');
      explorer.innerHTML = '';
      const breadcrumb = document.getElementById('breadcrumb');
      let parts = normalizedPath.split('/').filter(p => p);
      let currentPathStr = '';
      breadcrumb.innerHTML = '<a href="#" onclick="loadDirectory(\'\')">根目錄</a>';
      parts.forEach(part => {
        currentPathStr += '/' + part;
        breadcrumb.innerHTML += ' / <a href="#" onclick="loadDirectory(\'' + currentPathStr + '\')">' + part + '</a>';
      });
      
      data.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        if (a.isDir && b.isDir) return a.name.localeCompare(b.name);
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
        const extA = a.name.split('.').pop().toLowerCase();
        const extB = b.name.split('.').pop().toLowerCase();
        const aIsImage = imageExts.includes(extA);
        const bIsImage = imageExts.includes(extB);
        if (aIsImage && !bIsImage) return -1;
        if (!aIsImage && bIsImage) return 1;
        if (extA !== extB) return extA.localeCompare(extB);
        return a.name.localeCompare(b.name);
      });
      
      data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item';
        if (item.isDir) {
          div.classList.add("folder");
          div.innerHTML = '<br>' + item.name;
          div.onclick = () => {
            if (item.path === 'upload' || item.name === 'upload') {
              window.location.href = '作業呈現介面V3.html';
              return;
            }
            if (item.path.startsWith('upload/')) {
              const subFolder = item.name;
              window.location.href = '作業呈現介面V3.html?folder=' + encodeURIComponent(subFolder);
              return;
            }
            loadDirectory(item.path);
          };
        } else {
          const ext = item.name.split('.').pop().toLowerCase();
          const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
          const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'webm', 'aac'];
          if (imageExts.includes(ext)) {
            let titleText = item.name;
            let descText = '';
            if (item.name.includes('+')) {
              const parts = item.name.split('+');
              titleText = parts[0];
              const dotIndex = parts[1].lastIndexOf('.');
              descText = dotIndex !== -1 ? parts[1].substring(0, dotIndex) : parts[1];
            }
            div.innerHTML = `
              <img src="/${item.path}" alt="${item.name}">
              <div style="font-weight:bold; font-size:14px; margin-top:4px; color:#1e293b;">${titleText}</div>
              ${descText ? `<div style="font-size:12px; color:#64748b; background:#f1f5f9; border-radius:6px; padding:2px 4px; margin-top:2px; word-break:break-word;">${descText}</div>` : ''}
            `;
            div.onclick = () => openImageOverlay('/' + item.path);
          } else if (audioExts.includes(ext)) {
            div.classList.add("file");
            div.innerHTML = '🎵<br><br>' + item.name;
            div.onclick = () => window.open('/' + item.path, '_blank');
          } else {
            div.classList.add("file");
            div.innerHTML = '<br>' + item.name;
            div.onclick = () => window.open('/' + item.path, '_blank');
          }
        }
        explorer.appendChild(div);
      });
    });
}

// -----------------------------
// 圖片預覽視窗
function openImageOverlay(src) {
  let overlay = document.getElementById("imageOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "imageOverlay";
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.backgroundColor = "rgba(0,0,0,0.8)";
  overlay.style.zIndex = "2000";
  overlay.innerHTML = "";
  
  let closeBtn = document.createElement("div");
  closeBtn.id = "closeOverlay";
  closeBtn.innerText = "╳";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.color = "red";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "20px";
  closeBtn.style.right = "20px";
  closeBtn.style.fontSize = "30px";
  closeBtn.style.zIndex = "11";
  closeBtn.onclick = function(e) {
    e.stopPropagation();
    overlay.style.display = "none";
  };
  overlay.appendChild(closeBtn);
  
  let imageContainer = document.createElement("div");
  imageContainer.style.position = "relative";
  imageContainer.style.zIndex = "1";
  
  let img = document.createElement("img");
  img.src = src;
  img.style.maxWidth = "100%";
  img.style.maxHeight = "100%";
  img.style.boxShadow = "0 0 10px #fff";
  if (typeof overlay.currentScale === 'undefined') {
    overlay.currentScale = 1;
  }
  img.style.transform = "scale(" + overlay.currentScale + ")";
  
  imageContainer.appendChild(img);
  overlay.appendChild(imageContainer);
  
  let zoomControls = document.createElement("div");
  zoomControls.id = "zoomControls";
  zoomControls.style.position = "absolute";
  zoomControls.style.top = "20px";
  zoomControls.style.right = "70px";
  zoomControls.style.display = "flex";
  zoomControls.style.gap = "20px";
  zoomControls.style.zIndex = "10";
  
  let zoomInBtn = document.createElement("button");
  zoomInBtn.innerText = "➕";
  zoomInBtn.onclick = function(e) {
    e.stopPropagation();
    overlay.currentScale += 0.1;
    img.style.transform = "scale(" + overlay.currentScale + ")";
  };
  
  let zoomOutBtn = document.createElement("button");
  zoomOutBtn.innerText = "➖";
  zoomOutBtn.onclick = function(e) {
    e.stopPropagation();
    if (overlay.currentScale > 0.2) {
      overlay.currentScale -= 0.1;
      img.style.transform = "scale(" + overlay.currentScale + ")";
    }
  };
  
  zoomControls.appendChild(zoomInBtn);
  zoomControls.appendChild(zoomOutBtn);
  overlay.appendChild(zoomControls);
  
  overlay.onclick = function(e) {
    if(e.target === overlay) {
      overlay.style.display = "none";
    }
  };
  img.onclick = function(e){ e.stopPropagation(); };
  zoomControls.onclick = function(e){ e.stopPropagation(); };
}

// -----------------------------
// Modal 關閉函式
function closeUploadModal() {
  uploadModal.style.display = "none";
}
function closeFileUploadModal() {
  fileUploadModal.style.display = "none";
  droppedFile = null;
  dropZone.innerText = "📥 點擊或拖曳檔案至此區域上傳";
}
function closeAudioRecordModal() {
  audioRecordModal.style.display = "none";
  if (typeof stopAudioRecording === "function") {
    resetAudioRecording();
  }
}

// -----------------------------
// 初始化：載入根目錄
window.onload = function() {
  loadDirectory('');
};
