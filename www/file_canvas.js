// -----------------------------
// Canvas 初始化與繪圖處理
function initCanvas() {
  bgCanvas = document.getElementById("bgCanvas");
  drawCanvas = document.getElementById("drawCanvas");
  let w = window.innerWidth;
  let h = window.innerHeight - 60;
  bgCanvas.width = drawCanvas.width = w;
  bgCanvas.height = drawCanvas.height = h;
  bgCtx = bgCanvas.getContext("2d");
  drawCtx = drawCanvas.getContext("2d");
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  renderBackground();
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  // 監聽繪圖與雙擊事件（建立文字框）
  drawCanvas.addEventListener("pointerdown", startDraw);
  drawCanvas.addEventListener("pointermove", draw);
  drawCanvas.addEventListener("pointerup", endDraw);
  drawCanvas.addEventListener("pointercancel", endDraw);
  drawCanvas.addEventListener("pointerout", endDraw);
}

function renderBackground() {
  if (uploadedBackgroundBase64) {
    const img = new Image();
    img.onload = function() {
      let canvasAspect = bgCanvas.width / bgCanvas.height;
      let imgAspect = img.width / img.height;
      let drawWidth, drawHeight, offsetX, offsetY;
      if (imgAspect > canvasAspect) {
        drawWidth = bgCanvas.width;
        drawHeight = bgCanvas.width / imgAspect;
        offsetX = 0;
        offsetY = (bgCanvas.height - drawHeight) / 2;
      } else {
        drawHeight = bgCanvas.height;
        drawWidth = bgCanvas.height * imgAspect;
        offsetX = (bgCanvas.width - drawWidth) / 2;
        offsetY = 0;
      }
      bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
      bgCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      // 移除 CSS 背景圖
      bgCanvas.style.backgroundImage = "none";
    };
    img.src = "data:image/png;base64," + uploadedBackgroundBase64;
  } else {
    bgCtx.fillStyle = "#ffffff";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
  }
}

let lastTapTime = 0;
const doubleTapDelay = 300; // ms
function startDraw(e) {
  const currentTime = Date.now();
  if (currentTime - lastTapTime < doubleTapDelay) {
    const rect = fullCanvasMode.getBoundingClientRect();
    createTextBox(e.clientX - rect.left, e.clientY - rect.top);
    e.preventDefault();
    return;
  }
  lastTapTime = currentTime;
  isDrawing = true;
  drawCtx.beginPath();
  drawCtx.moveTo(e.offsetX, e.offsetY);
}

function draw(e) {
  if (!isDrawing) return;
  e.preventDefault();
  drawCtx.lineWidth = currentSize;
  if (isEraserMode) {
    drawCtx.globalCompositeOperation = "destination-out";
    drawCtx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    drawCtx.globalCompositeOperation = "source-over";
    drawCtx.strokeStyle = currentColor;
  }
  drawCtx.lineTo(e.offsetX, e.offsetY);
  drawCtx.stroke();
}

function endDraw(e) {
  isDrawing = false;
  drawCtx.closePath();
}

function useEraser() {
  isEraserMode = true;
}

function clearCanvas() {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

function exitCanvas() {
  fullCanvasMode.style.display = "none";
  uploadModal.style.display = "block";
  chosenMode = null;
  canvasImageBase64 = null;
  uploadedBackgroundBase64 = null;
  btnCanvas.innerText = "使用即時畫布";
  btnUpload.innerHTML = '上傳圖片';
  document.body.style.overflow = "auto";
}

// -----------------------------
// 修改 submitCanvas：
// 截圖前隱藏所有文字框的邊框與右下的圓形 (resize-handle)，截圖後再還原
function submitCanvas() {
  const textBoxes = fullCanvasMode.querySelectorAll('.text-box');
  const originalBorders = [];
  const originalHandleDisplays = [];
  textBoxes.forEach((box, idx) => {
    originalBorders[idx] = box.style.border;
    box.style.border = "none";
    const handle = box.querySelector('.resize-handle');
    if (handle) {
      originalHandleDisplays[idx] = handle.style.display;
      handle.style.display = "none";
    }
  });
  
  html2canvas(fullCanvasMode, { allowTaint: true, useCORS: true }).then(function(canvas) {
    // 還原文字框邊框與 resize-handle
    textBoxes.forEach((box, idx) => {
      box.style.border = originalBorders[idx];
      const handle = box.querySelector('.resize-handle');
      if (handle) {
        handle.style.display = originalHandleDisplays[idx];
      }
    });
    
    const dataURL = canvas.toDataURL("image/png");
    canvasImageBase64 = dataURL.split(",")[1];
    fullCanvasMode.style.display = "none";
    uploadModal.style.display = "block";
    let nameInput = document.getElementById("name");
    let discussionInput = document.getElementById("discussion");
    let baseName = nameInput.value.trim() || "canvas";
    let discussionText = discussionInput.value.trim();
    let canvasName = baseName + (discussionText ? "+" + discussionText : "");
    if (!canvasName.toLowerCase().endsWith(".png")) {
      canvasName += ".png";
    }
    nameInput.value = canvasName;
    canvasFileNameDisplay.innerText = "檔案名稱：" + canvasName;
    btnCanvas.innerText = "使用即時畫布 (已有畫布)";
    btnUpload.innerHTML = '上傳圖片 <span style="color:red;">(已使用即時畫布，不可上傳圖片)</span>';
  }).catch(function(error) {
    // 錯誤時也還原
    textBoxes.forEach((box, idx) => {
      box.style.border = originalBorders[idx];
      const handle = box.querySelector('.resize-handle');
      if (handle) {
        handle.style.display = originalHandleDisplays[idx];
      }
    });
    console.error("html2canvas error:", error);
  });
}

window.addEventListener("resize", function() {
  if (fullCanvasMode.style.display === "block") {
    let oldBg = bgCtx.getImageData(0, 0, bgCanvas.width, bgCanvas.height);
    let oldDraw = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    let w = window.innerWidth;
    let h = window.innerHeight - 60;
    bgCanvas.width = drawCanvas.width = w;
    bgCanvas.height = drawCanvas.height = h;
    bgCtx.putImageData(oldBg, 0, 0);
    drawCtx.putImageData(oldDraw, 0, 0);
  }
});

document.getElementById("brushColor").addEventListener("change", function(e) {
  currentColor = e.target.value;
  isEraserMode = false;
});
document.getElementById("brushSize").addEventListener("change", function(e) {
  currentSize = parseInt(e.target.value, 10);
  isEraserMode = false;
});

function uploadBackgroundImage() {
  backgroundImageInput.click();
}

backgroundImageInput.addEventListener("change", function(){
  const file = this.files[0];
  if(file) {
    let reader = new FileReader();
    reader.onload = function(e) {
      uploadedBackgroundBase64 = e.target.result.split(",")[1];
      renderBackground();
    };
    reader.readAsDataURL(file);
  }
});
