// -----------------------------
// 文字框與文字編輯功能
let activeTextBox = null;
let selectedColor = '#000000';
let initialTextSize = 16;
let isBold = false;
let isItalic = false;
const textEditModal = document.getElementById("text-edit-modal");
const textEditArea = document.getElementById("text-edit-area");
const confirmTextEdit = document.getElementById("confirm-text-edit");
const cancelTextEdit = document.getElementById("cancel-text-edit");
const colorOptions = document.querySelectorAll('.color-option');
const toggleBoldBtn = document.getElementById("toggle-bold");
const toggleItalicBtn = document.getElementById("toggle-italic");
const deleteTextBoxBtn = document.getElementById("delete-text-box");
const overlayElement = document.createElement("div");
overlayElement.className = "overlay";
document.body.appendChild(overlayElement);

function createTextBox(x, y) {
  const textBox = document.createElement('div');
  textBox.className = 'text-box';
  textBox.style.left = (x - 50) + "px";
  textBox.style.top = (y - 25) + "px";
  
  const textContent = document.createElement('div');
  textContent.className = 'text-content';
  textContent.contentEditable = false;
  textContent.style.color = selectedColor;
  textContent.style.fontSize = initialTextSize + "px";
  textContent.style.fontWeight = 'normal';
  textContent.style.fontStyle = 'normal';
  
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  
  textBox.appendChild(textContent);
  textBox.appendChild(resizeHandle);
  fullCanvasMode.appendChild(textBox);
  
  activeTextBox = textBox;
  isBold = false;
  isItalic = false;
  updateFormatButtons();
  openTextEditModal(textContent);
  makeDraggable(textBox);
  makeResizable(textBox, resizeHandle);

  textBox.addEventListener('pointerdown', function(e) {
    if (e.target.classList.contains('resize-handle')) return;
    const currentTime = Date.now();
    if (currentTime - lastTapTime < doubleTapDelay) {
      activeTextBox = this;
      const txtContent = this.querySelector('.text-content');
      openTextEditModal(txtContent);
      e.stopPropagation();
    }
    lastTapTime = currentTime;
  });
}

function openTextEditModal(textContentElement) {
  textEditArea.value = textContentElement.innerText || '';
  const currentClr = textContentElement.style.color || '#000000';
  colorOptions.forEach(option => {
    if (option.dataset.color === currentClr) {
      option.classList.add('selected');
      selectedColor = currentClr;
    } else {
      option.classList.remove('selected');
    }
  });
  isBold = (textContentElement.style.fontWeight === 'bold');
  isItalic = (textContentElement.style.fontStyle === 'italic');
  updateFormatButtons();
  textEditModal.style.display = 'block';
  overlayElement.style.display = 'block';
  textEditArea.focus();
}

function updateFormatButtons() {
  if(isBold) {
    toggleBoldBtn.classList.add('active');
  } else {
    toggleBoldBtn.classList.remove('active');
  }
  if(isItalic) {
    toggleItalicBtn.classList.add('active');
  } else {
    toggleItalicBtn.classList.remove('active');
  }
}

colorOptions.forEach(option => {
  option.addEventListener('click', function() {
    colorOptions.forEach(opt => opt.classList.remove('selected'));
    this.classList.add('selected');
    selectedColor = this.dataset.color;
  });
});

toggleBoldBtn.addEventListener('click', function() {
  isBold = !isBold;
  updateFormatButtons();
});

toggleItalicBtn.addEventListener('click', function() {
  isItalic = !isItalic;
  updateFormatButtons();
});

deleteTextBoxBtn.addEventListener('click', function() {
  if(activeTextBox) {
    activeTextBox.remove();
    closeTextEditModal();
  }
});

confirmTextEdit.addEventListener('click', function() {
  if(activeTextBox) {
    const textContent = activeTextBox.querySelector('.text-content');
    textContent.innerText = textEditArea.value;
    textContent.style.color = selectedColor;
    textContent.style.fontWeight = isBold ? 'bold' : 'normal';
    textContent.style.fontStyle = isItalic ? 'italic' : 'normal';
  }
  closeTextEditModal();
});

cancelTextEdit.addEventListener('click', function() {
  closeTextEditModal();
});

function closeTextEditModal(){
  textEditModal.style.display = 'none';
  overlayElement.style.display = 'none';
}

function makeDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  let isDragging = false;
  element.addEventListener('mousedown', dragStart);
  element.addEventListener('touchstart', touchStart, { passive: false });
  function dragStart(e) {
    if (e.target.classList.contains('resize-handle') || e.target.isContentEditable) return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    isDragging = true;
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', drag);
  }
  function touchStart(e) {
    if (e.target.classList.contains('resize-handle') || e.target.isContentEditable) return;
    const touch = e.touches[0];
    pos3 = touch.clientX;
    pos4 = touch.clientY;
    isDragging = true;
    document.addEventListener('touchend', touchEnd);
    document.addEventListener('touchmove', touchMove, { passive: false });
    e.preventDefault();
  }
  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
  }
  function touchMove(e) {
    if (!isDragging) return;
    const touch = e.touches[0];
    pos1 = pos3 - touch.clientX;
    pos2 = pos4 - touch.clientY;
    pos3 = touch.clientX;
    pos4 = touch.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    e.preventDefault();
  }
  function dragEnd() {
    isDragging = false;
    document.removeEventListener('mouseup', dragEnd);
    document.removeEventListener('mousemove', drag);
  }
  function touchEnd() {
    isDragging = false;
    document.removeEventListener('touchend', touchEnd);
    document.removeEventListener('touchmove', touchMove);
  }
}

function makeResizable(element, handle) {
  let startX, startY, startWidth, startHeight, startFontSize;
  let isResizing = false;
  handle.addEventListener('mousedown', resizeStart);
  handle.addEventListener('touchstart', touchResizeStart, { passive: false });
  function resizeStart(e) {
    e.preventDefault();
    e.stopPropagation();
    startX = e.clientX;
    startY = e.clientY;
    startWidth = element.offsetWidth;
    startHeight = element.offsetHeight;
    const textContent = element.querySelector('.text-content');
    startFontSize = parseInt(window.getComputedStyle(textContent).fontSize);
    isResizing = true;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', resizeEnd);
  }
  function touchResizeStart(e) {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startWidth = element.offsetWidth;
    startHeight = element.offsetHeight;
    const textContent = element.querySelector('.text-content');
    startFontSize = parseInt(window.getComputedStyle(textContent).fontSize);
    isResizing = true;
    document.addEventListener('touchmove', touchResize, { passive: false });
    document.addEventListener('touchend', touchResizeEnd);
  }
  function resize(e) {
    if (!isResizing) return;
    e.preventDefault();
    const newWidth = startWidth + (e.clientX - startX);
    const newHeight = startHeight + (e.clientY - startY);
    const widthRatio = newWidth / startWidth;
    element.style.width = newWidth + 'px';
    element.style.height = newHeight + 'px';
    const textContent = element.querySelector('.text-content');
    const newFontSize = Math.max(10, Math.round(startFontSize * widthRatio));
    textContent.style.fontSize = newFontSize + 'px';
  }
  function touchResize(e) {
    if (!isResizing) return;
    e.preventDefault();
    const touch = e.touches[0];
    const newWidth = startWidth + (touch.clientX - startX);
    const newHeight = startHeight + (touch.clientY - startY);
    const widthRatio = newWidth / startWidth;
    element.style.width = newWidth + 'px';
    element.style.height = newHeight + 'px';
    const textContent = element.querySelector('.text-content');
    const newFontSize = Math.max(10, Math.round(startFontSize * widthRatio));
    textContent.style.fontSize = newFontSize + 'px';
  }
  function resizeEnd() {
    isResizing = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', resizeEnd);
  }
  function touchResizeEnd() {
    isResizing = false;
    document.removeEventListener('touchmove', touchResize);
    document.removeEventListener('touchend', touchResizeEnd);
  }
}
