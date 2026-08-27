document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const imageUploader = document.getElementById('image-uploader');
    const uploaderContainer = document.getElementById('uploader-container');
    const mapContainer = document.getElementById('map-container');
    const transformWrapper = document.getElementById('transform-wrapper');
    const locationsList = document.getElementById('locations-list');
    const emptyListMessage = document.getElementById('empty-list-message');
    const nameModal = document.getElementById('name-modal');
    const locationNameInput = document.getElementById('location-name-input');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');
    const startPracticeBtn = document.getElementById('start-practice-btn');
    const submitAnswersBtn = document.getElementById('submit-answers-btn');
    const practiceAgainMainBtn = document.getElementById('practice-again-main-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');
    const quizTitleInput = document.getElementById('quiz-title-input');
    const generateBtn = document.getElementById('generate-btn');
    const resultModal = document.getElementById('result-modal');
    const resultTime = document.getElementById('result-time');
    const resultAccuracy = document.getElementById('result-accuracy');
    const practiceAgainBtn = document.getElementById('practice-again-btn');
    const closeResultModalBtn = document.getElementById('close-result-modal-btn');
    // Drawing Elements
    const toggleDrawBtn = document.getElementById('toggle-draw-btn');
    const undoDrawBtn = document.getElementById('undo-draw-btn');
    const drawCanvas = document.getElementById('draw-canvas');
    const ctx = drawCanvas.getContext('2d');
    const drawControls = document.getElementById('draw-controls');
    const currentColorSwatch = document.getElementById('current-color-swatch');
    const pickColorBtn = document.getElementById('pick-color-btn');
    const resetColorBtn = document.getElementById('reset-color-btn');
    // Zoom & Pan Elements
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');

    // Marker Overlay element
    let markerOverlay;

    // App State
    let locations = [];
    let tempCoords = null;
    let mode = 'setup'; // 'setup', 'practice', 'result', 'drawing', 'pickingColor'
    let practiceAnswers = {};
    let draggedMarkerInfo = null;
    let imageDimensions = { width: 0, height: 0, dataUrl: null };
    let practiceStartTime = null;
    
    // Zoom & Pan State
    let scale = 1;
    let pan = { x: 0, y: 0 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let hasMoved = false;

    // Drawing State
    let isDrawingMode = false;
    let isPainting = false;
    let drawPaths = [];
    let currentPath = [];
    let drawColor = '#FFFFFF';
    let offscreenCanvas = null;
    let offscreenCtx = null;

    function init() {
        markerOverlay = document.createElement('div');
        markerOverlay.id = 'marker-overlay';
        markerOverlay.style.position = 'absolute';
        markerOverlay.style.top = '0';
        markerOverlay.style.left = '0';
        markerOverlay.style.width = '100%';
        markerOverlay.style.height = '100%';
        markerOverlay.style.pointerEvents = 'none';
        mapContainer.appendChild(markerOverlay);
        
        setupEventListeners();
        render();
    }

    function setupEventListeners() {
        imageUploader.addEventListener('change', handleImageUpload);
        mapContainer.addEventListener('click', handleMapClick);
        drawCanvas.addEventListener('click', handleCanvasClick);
        saveButton.addEventListener('click', saveLocation);
        cancelButton.addEventListener('click', hideModal);
        locationNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveLocation(); });
        startPracticeBtn.addEventListener('click', startPractice);
        submitAnswersBtn.addEventListener('click', checkAnswers);
        resetBtn.addEventListener('click', resetToSetup);
        practiceAgainBtn.addEventListener('click', () => { resultModal.classList.add('hidden'); startPractice(); });
        practiceAgainMainBtn.addEventListener('click', startPractice);
        closeResultModalBtn.addEventListener('click', () => resultModal.classList.add('hidden'));
        downloadBtn.addEventListener('click', downloadPracticeHTML);
    if (generateBtn) generateBtn.addEventListener('click', saveQuizDirectlyToBackend);
        
        document.addEventListener('mousemove', handleDocumentMouseMove);
        document.addEventListener('mouseup', handleDocumentMouseUp);
        document.addEventListener('touchmove', handleDocumentMouseMove, { passive: false });
        document.addEventListener('touchend', handleDocumentMouseUp);

        toggleDrawBtn.addEventListener('click', toggleDrawingMode);
        undoDrawBtn.addEventListener('click', undoLastDraw);
        pickColorBtn.addEventListener('click', toggleColorPickingMode);
        resetColorBtn.addEventListener('click', resetDrawColor);

        drawCanvas.addEventListener('mousedown', startPainting);
        drawCanvas.addEventListener('mousemove', paint);
        drawCanvas.addEventListener('mouseup', stopPainting);
        drawCanvas.addEventListener('mouseleave', stopPainting);
        drawCanvas.addEventListener('touchstart', startPainting, { passive: false });
        drawCanvas.addEventListener('touchmove', paint, { passive: false });
        drawCanvas.addEventListener('touchend', stopPainting);

        window.addEventListener('resize', render);
        document.addEventListener('paste', handlePaste);

        mapContainer.addEventListener('wheel', handleWheel, { passive: false });
        mapContainer.addEventListener('mousedown', handlePanStart);
        
        zoomInBtn.addEventListener('click', () => applyZoom(0.2));
        zoomOutBtn.addEventListener('click', () => applyZoom(-0.2));
        zoomResetBtn.addEventListener('click', resetTransform);
    }

    // --- Zoom & Pan Functions ---
    function applyTransform() {
        const info = getRenderedImageInfo();
        if(!info) return;
        
        transformWrapper.style.width = `${info.renderedW}px`;
        transformWrapper.style.height = `${info.renderedH}px`;
        transformWrapper.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
    }

    function resetTransform() {
        if (locations.length > 0) return;
        scale = 1;
        const info = getRenderedImageInfo();
        if (info) {
             pan = { x: info.offsetX, y: info.offsetY };
        } else {
             pan = { x: 0, y: 0 };
        }
        render();
    }
    
    function applyZoom(delta) {
        if (locations.length > 0 || !imageDimensions.dataUrl) return;
        const oldScale = scale;
        scale = Math.max(0.5, Math.min(10, scale + delta));
        const containerRect = mapContainer.getBoundingClientRect();
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;
        pan.x = centerX - (centerX - pan.x) * (scale / oldScale);
        pan.y = centerY - (centerY - pan.y) * (scale / oldScale);
        render();
    }
    
    function handleWheel(e) {
        if (locations.length > 0 || isDrawingMode || !imageDimensions.dataUrl) return;
        e.preventDefault();
        const delta = e.deltaY * -0.005;
        const oldScale = scale;
        scale = Math.max(0.5, Math.min(10, scale + delta));
        const containerRect = mapContainer.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;
        pan.x = mouseX - (mouseX - pan.x) * (scale / oldScale);
        pan.y = mouseY - (mouseY - pan.y) * (scale / oldScale);
        render();
    }

    function handlePanStart(e) {
        if (locations.length > 0 || e.button !== 0 || isDrawingMode || draggedMarkerInfo || e.target.closest('.marker')) return;
        e.preventDefault();
        isPanning = true;
        hasMoved = false;
        panStart.x = e.clientX - pan.x;
        panStart.y = e.clientY - pan.y;
        mapContainer.style.cursor = 'grabbing';
    }

    // --- Drawing & Color Picking Functions ---
    function toggleDrawingMode() {
        isDrawingMode = !isDrawingMode;
        if (isDrawingMode) {
            mode = 'drawing';
            toggleDrawBtn.textContent = '關閉畫筆';
            toggleDrawBtn.classList.replace('bg-yellow-500', 'bg-red-500');
            drawControls.classList.remove('hidden');
            drawCanvas.style.pointerEvents = 'auto';
            transformWrapper.style.pointerEvents = 'auto';
            mapContainer.style.cursor = 'crosshair';
        } else {
            if (mode === 'pickingColor') toggleColorPickingMode();
            mode = 'setup';
            toggleDrawBtn.textContent = '啟用畫筆';
            toggleDrawBtn.classList.replace('bg-red-500', 'bg-yellow-500');
            drawControls.classList.add('hidden');
            drawCanvas.style.pointerEvents = 'none';
            transformWrapper.style.pointerEvents = 'none';
            mapContainer.style.cursor = 'grab';
            isPainting = false;
            currentPath = [];
        }
        renderControls();
    }

    function toggleColorPickingMode() {
        if (mode !== 'pickingColor') {
            mode = 'pickingColor';
            pickColorBtn.textContent = '取消吸取';
            pickColorBtn.classList.replace('bg-indigo-500', 'bg-gray-500');
            mapContainer.style.cursor = 'copy';
        } else {
            mode = 'drawing';
            pickColorBtn.textContent = '吸取顏色';
            pickColorBtn.classList.replace('bg-gray-500', 'bg-indigo-500');
            mapContainer.style.cursor = 'crosshair';
        }
    }

    function resetDrawColor() {
        drawColor = '#FFFFFF';
        currentColorSwatch.style.backgroundColor = drawColor;
    }

    function handleCanvasClick(event) {
        if (mode !== 'pickingColor') return;
        const info = getRenderedImageInfo();
        if (!info || !offscreenCanvas) return;
        const rect = drawCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const scaleX = offscreenCanvas.width / drawCanvas.width;
        const scaleY = offscreenCanvas.height / drawCanvas.height;
        const imageX = Math.floor(x * scaleX);
        const imageY = Math.floor(y * scaleY);
        const pixelData = offscreenCtx.getImageData(imageX, imageY, 1, 1).data;
        drawColor = `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`;
        currentColorSwatch.style.backgroundColor = drawColor;
        toggleColorPickingMode();
    }

    function getCoords(event) {
        const rect = drawCanvas.getBoundingClientRect();
        const touch = event.touches ? event.touches[0] : null;
        const clientX = touch ? touch.clientX : event.clientX;
        const clientY = touch ? touch.clientY : event.clientY;
        return { 
            x: (clientX - rect.left) / scale, 
            y: (clientY - rect.top) / scale
        };
    }

    function startPainting(event) {
        if (mode !== 'drawing' || isPainting || (event.button && event.button !== 0)) return;
        event.preventDefault();
        event.stopPropagation();
        isPainting = true;
        currentPath = [getCoords(event)];
    }

    function paint(event) {
        if (!isPainting) return;
        event.preventDefault();
        currentPath.push(getCoords(event));
        redrawCanvas();
    }

    function stopPainting() {
        if (!isPainting) return;
        isPainting = false;
        if (currentPath.length > 1) {
            drawPaths.push({ points: currentPath, color: drawColor });
        }
        currentPath = [];
        redrawCanvas();
    }

    function undoLastDraw() {
        if (drawPaths.length > 0) {
            drawPaths.pop();
            redrawCanvas();
        }
    }

    function resizeCanvas() {
        const info = getRenderedImageInfo();
        if (info) {
            drawCanvas.style.left = `0px`;
            drawCanvas.style.top = `0px`;
            drawCanvas.width = info.renderedW;
            drawCanvas.height = info.renderedH;
            redrawCanvas();
        }
    }

    function redrawCanvas() {
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        ctx.save();
        const allPaths = [...drawPaths];
        if (currentPath.length > 1) {
            allPaths.push({ points: currentPath, color: drawColor });
        }
        allPaths.forEach(pathObj => {
            if (!pathObj.points || pathObj.points.length < 2) return;
            ctx.strokeStyle = pathObj.color;
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(pathObj.points[0].x, pathObj.points[0].y);
            for (let i = 1; i < pathObj.points.length; i++) {
                ctx.lineTo(pathObj.points[i].x, pathObj.points[i].y);
            }
            ctx.stroke();
        });
        ctx.restore();
    }

    function getRenderedImageInfo() {
        const containerRect = mapContainer.getBoundingClientRect();
        if (!imageDimensions.width || !imageDimensions.height || !containerRect.width || !containerRect.height) return null;
        const containerRatio = containerRect.width / containerRect.height;
        const imageRatio = imageDimensions.width / imageDimensions.height;
        let renderedW, renderedH, offsetX, offsetY;
        if (imageRatio > containerRatio) {
            renderedW = containerRect.width;
            renderedH = containerRect.width / imageRatio;
            offsetX = 0;
            offsetY = (containerRect.height - renderedH) / 2;
        } else {
            renderedH = containerRect.height;
            renderedW = containerRect.height * imageRatio;
            offsetY = 0;
            offsetX = (containerRect.width - renderedW) / 2;
        }
        return { renderedW, renderedH, offsetX, offsetY, containerRect };
    }

    function handlePaste(event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    event.preventDefault(); 
                    processImageFile(file);
                    break;
                }
            }
        }
    }

    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            processImageFile(file);
        }
    }

    function processImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX_DIMENSION = 1024;
                let originalWidth = img.naturalWidth;
                let originalHeight = img.naturalHeight;
                let newWidth = originalWidth;
                let newHeight = originalHeight;
                if (originalWidth > MAX_DIMENSION || originalHeight > MAX_DIMENSION) {
                    if (originalWidth > originalHeight) {
                        newWidth = MAX_DIMENSION;
                        newHeight = Math.round((originalHeight * MAX_DIMENSION) / originalWidth);
                    } else {
                        newHeight = MAX_DIMENSION;
                        newWidth = Math.round((originalWidth * MAX_DIMENSION) / originalHeight);
                    }
                }
                const resizeCanvas = document.createElement('canvas');
                resizeCanvas.width = newWidth;
                resizeCanvas.height = newHeight;
                const resizeCtx = resizeCanvas.getContext('2d');
                resizeCtx.drawImage(img, 0, 0, newWidth, newHeight);
                const compressedDataUrl = resizeCanvas.toDataURL('image/jpeg', 0.9);
                const compressedImg = new Image();
                compressedImg.onload = () => {
                    imageDimensions = { width: compressedImg.width, height: compressedImg.height, dataUrl: compressedDataUrl };
                    offscreenCanvas = document.createElement('canvas');
                    offscreenCanvas.width = compressedImg.width;
                    offscreenCanvas.height = compressedImg.height;
                    offscreenCtx = offscreenCanvas.getContext('2d');
                    offscreenCtx.drawImage(compressedImg, 0, 0);
                    transformWrapper.style.backgroundImage = `url(${compressedDataUrl})`;
                    mapContainer.style.backgroundImage = 'none';
                    uploaderContainer.classList.add('hidden');
                    mapContainer.classList.remove('hidden');
                    resetToSetup();
                    locations = [];
                    drawPaths = [];
                    currentPath = [];
                    render();
                    resetTransform();
                };
                compressedImg.src = compressedDataUrl;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function handleMapClick(event) {
        if (mode !== 'setup' || event.target.closest('.marker') || hasMoved) return;
        const info = getRenderedImageInfo();
        if (!info) return;
        const clickX_in_container = event.clientX - info.containerRect.left;
        const clickY_in_container = event.clientY - info.containerRect.top;
        const worldX = (clickX_in_container - pan.x) / scale;
        const worldY = (clickY_in_container - pan.y) / scale;
        if (worldX >= 0 && worldX <= info.renderedW && worldY >= 0 && worldY <= info.renderedH) {
             tempCoords = { x: (worldX / info.renderedW) * 100, y: (worldY / info.renderedH) * 100 };
             showModal();
        }
    }
    
    function startPractice() { mode = 'practice'; practiceAnswers = {}; practiceStartTime = Date.now(); render(); resetTransform(); }
    
    function checkAnswers() { 
        mode = 'result'; 
        const elapsedTime = Math.round((Date.now() - practiceStartTime) / 1000);
        let correctCount = locations.filter(loc => practiceAnswers[loc.id] === loc.id).length;
        const accuracy = locations.length > 0 ? Math.round((correctCount / locations.length) * 100) : 0;
        resultTime.textContent = `${elapsedTime} 秒`;
        resultAccuracy.textContent = `${accuracy}% (${correctCount}/${locations.length})`;
        resultModal.classList.remove('hidden');
        render(); 
    }
    
    function resetToSetup() { 
        if(isDrawingMode) toggleDrawingMode();
        mode = 'setup';
        practiceAnswers = {}; 
        practiceStartTime = null; 
        if(imageDimensions.dataUrl) resetTransform();
        render(); 
    }
    
    function showModal() { locationNameInput.value = ''; nameModal.classList.remove('hidden'); locationNameInput.focus(); }
    function hideModal() { nameModal.classList.add('hidden'); tempCoords = null; }
    
    function saveLocation() {
        const name = locationNameInput.value.trim();
        if (name && tempCoords) {
            locations.push({ id: Date.now(), name: name, x: tempCoords.x, y: tempCoords.y });
            hideModal();
            render();
        }
    }
    
    function deleteLocation(id) { locations = locations.filter(loc => loc.id !== id); render(); }

    function handleDragStart(event, locationId) { event.dataTransfer.setData('text/plain', locationId); setTimeout(() => event.target.classList.add('dragging'), 0); }
    function handleDragEnd(event) { event.target.classList.remove('dragging'); }
    function handleDragOver(event) { event.preventDefault(); event.currentTarget.classList.add('drag-over-marker'); }
    function handleDragLeave(event) { event.currentTarget.classList.remove('drag-over-marker'); }
    function handleDrop(event, markerId) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over-marker');
        const locationId = parseInt(event.dataTransfer.getData('text/plain'));
        for (const key in practiceAnswers) { if (practiceAnswers[key] === locationId) delete practiceAnswers[key]; }
        practiceAnswers[markerId] = locationId;
        render();
    }
    
    function handleMarkerMouseDown(event, locationId) { 
        if (mode === 'setup') { 
            event.preventDefault(); 
            event.stopPropagation(); 
            draggedMarkerInfo = { id: locationId, element: event.currentTarget }; 
        } 
    }
    
    function handleDocumentMouseMove(event) {
        const isTouch = !!(event.touches && event.touches[0]);
        const clientX = isTouch ? event.touches[0].clientX : event.clientX;
        const clientY = isTouch ? event.touches[0].clientY : event.clientY;
        if (isPanning) {
            event.preventDefault();
            const dx = Math.abs(clientX - (panStart.x + pan.x));
            const dy = Math.abs(clientY - (panStart.y + pan.y));
            if (dx > 5 || dy > 5) hasMoved = true;
            pan.x = clientX - panStart.x;
            pan.y = clientY - panStart.y;
            applyTransform();
            renderMarkers();
            return;
        }
        if (!draggedMarkerInfo) return;
        event.preventDefault();
        const info = getRenderedImageInfo();
        if (!info) return;
        const cursorX_in_container = clientX - info.containerRect.left;
        const cursorY_in_container = clientY - info.containerRect.top;
        draggedMarkerInfo.element.style.left = `${cursorX_in_container}px`;
        draggedMarkerInfo.element.style.top = `${cursorY_in_container}px`;
    }

    function handleDocumentMouseUp(event) {
        if (isPanning) {
            isPanning = false;
            mapContainer.style.cursor = 'grab';
        }
        if (!draggedMarkerInfo) return;
        const info = getRenderedImageInfo();
        const location = locations.find(loc => loc.id === draggedMarkerInfo.id);
        if (location && info) {
            const finalScreenX = parseFloat(draggedMarkerInfo.element.style.left);
            const finalScreenY = parseFloat(draggedMarkerInfo.element.style.top);
            const worldX = (finalScreenX - pan.x) / scale;
            const worldY = (finalScreenY - pan.y) / scale;
            location.x = Math.max(0, Math.min(100, (worldX / info.renderedW) * 100));
            location.y = Math.max(0, Math.min(100, (worldY / info.renderedH) * 100));
        }
        draggedMarkerInfo = null;
        render();
    }

    function render() { 
        renderControls(); 
        resizeCanvas(); 
        applyTransform();
        renderMarkers(); 
        renderList(); 
        redrawCanvas(); 
    }
    
    function renderControls() {
        const isSetupMode = mode === 'setup' || mode === 'drawing' || mode === 'pickingColor';
        startPracticeBtn.classList.toggle('hidden', !isSetupMode);
        submitAnswersBtn.classList.toggle('hidden', mode !== 'practice');
        practiceAgainMainBtn.classList.toggle('hidden', mode !== 'result');
        resetBtn.classList.toggle('hidden', !isSetupMode);
        const hasLocations = locations.length > 0;
        const hasImage = !!imageDimensions.dataUrl;
        startPracticeBtn.disabled = !hasLocations || isDrawingMode;
        downloadBtn.disabled = !hasLocations || !hasImage;
        toggleDrawBtn.disabled = !hasImage;
        [zoomInBtn, zoomOutBtn, zoomResetBtn].forEach(btn => btn.disabled = !hasImage || hasLocations);
        if (isDrawingMode && !hasImage) toggleDrawingMode();
        if (isDrawingMode) {
            mapContainer.style.cursor = 'crosshair';
        } else if (hasLocations) {
            mapContainer.style.cursor = 'default';
        } else {
            mapContainer.style.cursor = isPanning ? 'grabbing' : 'grab';
        }
    }

    function renderMarkers() {
        markerOverlay.innerHTML = '';
        if (mode === 'idle') return;
        const info = getRenderedImageInfo();
        if (!info) return;
        locations.forEach((loc, index) => {
            const marker = document.createElement('div');
            marker.className = 'marker absolute w-10 h-10 rounded-full transform -translate-x-1/2 -translate-y-1/2 shadow-lg border-2 border-white flex items-center justify-center transition-colors duration-300';
            const worldX = (loc.x / 100) * info.renderedW;
            const worldY = (loc.y / 100) * info.renderedH;
            const screenX = (worldX * scale) + pan.x;
            const screenY = (worldY * scale) + pan.y;
            marker.style.left = `${screenX}px`;
            marker.style.top = `${screenY}px`;
            marker.dataset.id = loc.id;
            const isSetupMode = mode === 'setup' || mode === 'drawing' || mode === 'pickingColor';
            if (isSetupMode) {
                marker.classList.add('bg-indigo-600', 'marker-in-setup');
                marker.style.pointerEvents = isDrawingMode ? 'none' : 'auto';
                marker.innerHTML = `<span>${index + 1}</span>`;
                marker.addEventListener('mousedown', (e) => handleMarkerMouseDown(e, loc.id));
                marker.addEventListener('touchstart', (e) => handleMarkerMouseDown(e, loc.id));
            } else {
                marker.classList.add('bg-gray-400');
                const droppedLocationId = practiceAnswers[loc.id];
                if (droppedLocationId) {
                    const droppedLocation = locations.find(l => l.id === droppedLocationId);
                    marker.innerHTML = `<div class="dropped-text text-xs">${droppedLocation.name}</div>`;
                }
                if (mode === 'practice') {
                    marker.style.pointerEvents = 'auto';
                    marker.classList.add('marker-in-practice');
                    marker.addEventListener('dragover', handleDragOver);
                    marker.addEventListener('dragleave', handleDragLeave);
                    marker.addEventListener('drop', (e) => handleDrop(e, loc.id));
                    if (droppedLocationId) {
                        marker.draggable = true;
                        marker.addEventListener('dragstart', (e) => handleDragStart(e, droppedLocationId));
                        marker.addEventListener('dragend', handleDragEnd);
                    }
                } else if (mode === 'result' && droppedLocationId) {
                    const isCorrect = droppedLocationId === loc.id;
                    marker.classList.toggle('bg-green-500', isCorrect);
                    marker.classList.toggle('bg-red-500', !isCorrect);
                }
            }
            markerOverlay.appendChild(marker);
        });
    }

    function renderList() {
        locationsList.innerHTML = '';
        const isSetupMode = mode === 'setup' || mode === 'drawing' || mode === 'pickingColor';
        if (locations.length === 0 && isSetupMode) { 
            locationsList.appendChild(emptyListMessage); 
            return; 
        }
        if (isSetupMode) {
            locations.forEach((loc, index) => {
                const listItem = document.createElement('div');
                listItem.className = 'flex items-center justify-between p-3 mb-2 bg-gray-50 rounded-lg';
                listItem.innerHTML = `<div class="flex items-center"><div class="w-7 h-7 mr-4 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">${index + 1}</div><span class="font-medium text-gray-800">${loc.name}</span></div>`;
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'p-2 rounded-full hover:bg-red-100 text-gray-500 hover:text-red-600';
                deleteBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
                deleteBtn.onclick = () => deleteLocation(loc.id);
                listItem.appendChild(deleteBtn);
                locationsList.appendChild(listItem);
            });
        } else if (mode === 'practice') {
            const usedLocationIds = Object.values(practiceAnswers);
            const shuffled = [...locations].sort(() => Math.random() - 0.5);
            shuffled.forEach(loc => {
                const listItem = document.createElement('div');
                listItem.className = 'flex items-center justify-between p-3 mb-2 bg-gray-50 rounded-lg';
                listItem.innerHTML = `<span class="font-medium text-gray-800">${loc.name}</span>`;
                if (usedLocationIds.includes(loc.id)) { 
                    listItem.classList.add('opacity-30'); 
                } else {
                    listItem.draggable = true;
                    listItem.classList.add('location-item-in-practice');
                    listItem.addEventListener('dragstart', (e) => handleDragStart(e, loc.id));
                    listItem.addEventListener('dragend', handleDragEnd);
                }
                locationsList.appendChild(listItem);
            });
        } else if (mode === 'result') {
            locationsList.innerHTML = '<p class="text-center text-gray-500 pt-8">練習結束！點擊「重新練習」再次挑戰。</p>';
        }
    }

    // --- DOWNLOAD HTML SECTION (MODIFIED) ---

    function getQuizTitle() {
        const inputVal = quizTitleInput ? quizTitleInput.value.trim() : '';
        return inputVal || '互動式地圖標示測驗';
    }

    async function downloadPracticeHTML() {
        if (locations.length === 0) {
            alert("請先上傳地圖並新增標記地點！");
            return;
        }
        const title = getQuizTitle();
        const mergedImageDataUrl = await createMergedImage();
        if (!mergedImageDataUrl) {
            alert("無法產生包含繪圖的圖片。");
            return;
        }
        const imageInfoWithDrawing = { ...imageDimensions, dataUrl: mergedImageDataUrl };
        const viewState = { scale: scale, pan: pan };
        const practiceHTML = generatePracticeHTML(imageInfoWithDrawing, viewState, title);
        const blob = new Blob([practiceHTML], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function saveQuizDirectlyToBackend() {
        if (locations.length === 0) {
            alert("請先上傳地圖並至少新增一個標記地點！");
            return;
        }
        const title = getQuizTitle();
        const saveStatusEl = document.getElementById('save-status-msg');
        if (saveStatusEl) {
            saveStatusEl.textContent = '⏳ 正在生成測驗並儲存至伺服器...';
            saveStatusEl.className = 'text-xs text-blue-600 font-bold block mt-2';
        }

        const mergedImageDataUrl = await createMergedImage();
        if (!mergedImageDataUrl) {
            alert("無法產生包含繪圖的圖片。");
            if (saveStatusEl) saveStatusEl.textContent = '';
            return;
        }

        const imageInfoWithDrawing = { ...imageDimensions, dataUrl: mergedImageDataUrl };
        const viewState = { scale: scale, pan: pan };
        const practiceHTML = generatePracticeHTML(imageInfoWithDrawing, viewState, title);

        try {
            const response = await fetch('/saveQuiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    html: practiceHTML,
                    category: '互動式地圖標示測驗'
                })
            });

            if (response.ok) {
                const res = await response.json();
                if (res.status === 'success') {
                    if (saveStatusEl) {
                        saveStatusEl.innerHTML = `✅ 測驗已成功儲存至 <b>html/互動式地圖標示測驗/${res.filename}</b>！ <a href="${res.url}" target="_blank" class="underline text-indigo-700 ml-1 font-bold">點此立即開啟測驗 ↗</a>`;
                        saveStatusEl.className = 'text-xs text-green-700 font-bold block mt-2 bg-green-50 p-2.5 rounded-lg border border-green-200';
                    }
                    showSuccessModal(title, res.url);
                    return;
                }
            }
            throw new Error('伺服器未回傳成功狀態');
        } catch (e) {
            console.warn('透過後端儲存失敗，改為提供前端下載：', e);
            if (saveStatusEl) {
                saveStatusEl.textContent = '⚠️ 儲存至伺服器失敗，已自動為您下載 HTML 備份！';
                saveStatusEl.className = 'text-xs text-amber-600 font-bold block mt-2';
            }
            downloadPracticeHTML();
        }
    }

    function showSuccessModal(title, relUrl) {
        let modal = document.getElementById('save-success-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'save-success-modal';
            modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md text-center">
                    <div class="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold">✓</div>
                    <h3 class="text-xl font-bold text-gray-900 mb-2">測驗網頁直接生成成功！</h3>
                    <p class="text-sm text-gray-600 mb-3">檔案已直接生成並儲存至：</p>
                    <div class="bg-gray-100 p-2.5 rounded-lg text-xs font-mono text-indigo-600 font-bold mb-4 break-all text-left" id="modal-saved-path"></div>
                    <div class="flex justify-center gap-3">
                        <button id="modal-close-save-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-bold text-sm">關閉</button>
                        <a id="modal-open-saved-link" href="#" target="_blank" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm flex items-center gap-1">
                            <span>立即開啟測驗</span> ↗
                        </a>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('modal-close-save-btn').onclick = () => modal.classList.add('hidden');
        }
        document.getElementById('modal-saved-path').textContent = 'www/html/互動式地圖標示測驗/' + title + '.html';
        document.getElementById('modal-open-saved-link').href = relUrl;
        modal.classList.remove('hidden');
    }

    function generatePracticeHTML(imageInfoForDownload, viewState, customTitle = "地圖標記練習") {
        const locationsJSON = JSON.stringify(locations);
        const imageJSON = JSON.stringify(imageInfoForDownload);
        const viewStateJSON = JSON.stringify(viewState);

        return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${customTitle}</title><script src="https://cdn.tailwindcss.com"><\/script><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{font-family:'Inter','Noto Sans TC',sans-serif;}.marker{pointer-events:auto}.marker span,.marker .dropped-text{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:14px;font-weight:700;color:#fff;text-align:center;padding:2px;line-height:1.2;user-select:none}.dragging{opacity:.5;background:#e0e7ff}.drag-over-marker{transform:scale(1.2) translate(-50%,-50%);box-shadow:0 0 0 4px rgba(79,70,229,.5)}.location-item-in-practice,.marker-in-practice[draggable=true]{cursor:grab}.location-item-in-practice:active,.marker-in-practice[draggable=true]:active{cursor:grabbing}#transform-wrapper{transform-origin:0 0;background-size:contain;background-position:center;background-repeat:no-repeat}<\/style></head><body class="bg-gray-100 text-gray-800 flex flex-col h-screen"><header class="bg-white shadow-md p-4 flex justify-between items-center"><h1 class="text-2xl font-bold text-gray-900">${customTitle}</h1><p class="text-xs text-gray-400 self-end">Made by 阿剛老師</p></header><main class="flex-grow flex flex-col lg:flex-row p-4 lg:p-8 gap-8 overflow-hidden"><div id="map-section" class="flex-grow flex flex-col bg-white rounded-xl shadow-lg p-6 w-full lg:w-2/3"><div id="map-container" class="relative w-full h-full overflow-hidden touch-none rounded-md shadow-inner bg-gray-200"><div id="transform-wrapper" class="absolute top-0 left-0"></div><div id="marker-overlay" class="absolute top-0 left-0 w-full h-full pointer-events-none"></div></div></div><div class="w-full lg:w-1/3 flex flex-col bg-white rounded-xl shadow-lg p-6 h-full overflow-hidden"><div class="flex justify-between items-center border-b pb-2 mb-4"><h2 class="text-xl font-bold">地點清單</h2><div id="mode-controls"><button id="start-practice-btn" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition font-semibold text-sm">開始練習</button><button id="submit-answers-btn" class="hidden px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-semibold text-sm">送出答案</button><button id="practice-again-main-btn" class="hidden px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition font-semibold text-sm">重新練習</button></div></div><div id="locations-list" class="flex-grow overflow-y-auto pr-2"></div></div></main><div id="result-modal" class="hidden fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4"><div class="bg-white rounded-lg shadow-2xl p-8 w-full max-w-sm text-center"><h3 class="text-2xl font-bold mb-4 text-gray-900">練習結果</h3><div class="space-y-3 text-left my-6"><p class="text-lg text-gray-700"><span class="font-semibold">答題時間：</span><span id="result-time"></span></p><p class="text-lg text-gray-700"><span class="font-semibold">答對率：</span><span id="result-accuracy"></span></p></div><div class="flex justify-center gap-4 mt-6"><button id="close-result-modal-btn" class="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition font-semibold">關閉</button><button id="practice-again-btn" class="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition font-semibold">重新練習</button></div></div></div><script>
document.addEventListener("DOMContentLoaded",()=>{const t=${locationsJSON},e=${imageJSON},s=${viewStateJSON},o=document.getElementById("map-container"),n=document.getElementById("transform-wrapper"),r=document.getElementById("marker-overlay"),i=document.getElementById("locations-list"),a=document.getElementById("start-practice-btn"),d=document.getElementById("submit-answers-btn"),c=document.getElementById("practice-again-main-btn"),l=document.getElementById("result-modal"),u=document.getElementById("result-time"),m=document.getElementById("result-accuracy"),p=document.getElementById("practice-again-btn"),g=document.getElementById("close-result-modal-btn");let v="setup",f={},h=null;function w(){const t=o.getBoundingClientRect();if(!e.width||!e.height||!t.width||!t.height)return null;const n=t.width/t.height,s=e.width/e.height;let r,i,a,d;return s>n?(r=t.width,i=t.width/s,a=0,d=(t.height-i)/2):(i=t.height,r=t.height*s,d=0,a=(t.width-r)/2),{renderedW:r,renderedH:i,offsetX:a,offsetY:d}}function L(){v="practice",h=Date.now(),y()}function k(){v="result";const e=Math.round((Date.now()-h)/1e3);let o=t.filter(t=>f[t.id]===t.id).length;const n=t.length>0?Math.round(o/t.length*100):0;u.textContent=\`\${e} 秒\`,m.textContent=\`\${n}% (\${o}/\${t.length})\`,l.classList.remove("hidden"),y()}function E(t,e){t.dataTransfer.setData("text/plain",e),setTimeout(()=>{t.target.classList.add("dragging")},0)}function b(t){t.target.classList.remove("dragging")}function x(t){t.preventDefault(),t.currentTarget.classList.add("drag-over-marker")}function T(t){t.currentTarget.classList.remove("drag-over-marker")}function S(t,e){t.preventDefault(),t.currentTarget.classList.remove("drag-over-marker");const o=parseInt(t.dataTransfer.getData("text/plain"));for(const t in f)f[t]===o&&delete f[t];f[e]=o,y()}function y(){const o=w();if(!o)return;a.classList.toggle("hidden","setup"!==v),d.classList.toggle("hidden","practice"!==v),c.classList.toggle("hidden","result"!==v),n.style.width=\`\${o.renderedW}px\`,n.style.height=\`\${o.renderedH}px\`,n.style.backgroundImage=\`url(\${e.dataUrl})\`,n.style.transform=\`translate(\${s.pan.x}px, \${s.pan.y}px) scale(\${s.scale})\`,r.innerHTML="",t.forEach(e=>{const n=document.createElement("div");n.className="marker absolute w-10 h-10 rounded-full transform -translate-x-1/2 -translate-y-1/2 shadow-lg border-2 border-white flex items-center justify-center transition-colors duration-300";const i=(e.x/100)*o.renderedW,a=(e.y/100)*o.renderedH,d=i*s.scale+s.pan.x,c=a*s.scale+s.pan.y;n.style.left=\`\${d}px\`,n.style.top=\`\${c}px\`,n.dataset.id=e.id,n.classList.add("bg-gray-400");const l=f[e.id];if(l){const o=t.find(t=>t.id===l);n.innerHTML=\`<div class="dropped-text text-xs">\${o.name}<\/div>\`}"practice"===v?(n.classList.add("marker-in-practice"),n.addEventListener("dragover",x),n.addEventListener("dragleave",T),n.addEventListener("drop",t=>S(t,e.id)),l&&(n.draggable=!0,n.addEventListener("dragstart",t=>E(t,l)),n.addEventListener("dragend",b))):"result"===v&&l&&n.classList.toggle("bg-green-500",l===e.id),r.appendChild(n)}),i.innerHTML="",("setup"===v||"practice"===v)?([...t].sort(()=>.5-Math.random()).forEach(t=>{const e=document.createElement("div");e.className="flex items-center justify-between p-3 mb-2 bg-gray-50 rounded-lg",e.innerHTML=\`<span class="font-medium text-gray-800">\${t.name}<\/span>\`,Object.values(f).includes(t.id)?e.classList.add("opacity-30"):(e.draggable=!0,e.classList.add("location-item-in-practice"),e.addEventListener("dragstart",e=>E(e,t.id)),e.addEventListener("dragend",b)),i.appendChild(e)})):"result"===v&&(i.innerHTML='<p class="text-center text-gray-500 pt-8">練習結束！</p>')}a.addEventListener("click",L),d.addEventListener("click",k),c.addEventListener("click",()=>{v="setup",L()}),p.addEventListener("click",()=>{l.classList.add("hidden"),v="setup",L()}),g.addEventListener("click",()=>l.classList.add("hidden")),window.addEventListener("resize",y),y()});<\/script></body></html>`;
    }

    // --- END OF MODIFIED SECTION ---

    function createMergedImage() {
        return new Promise((resolve) => {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                tempCanvas.width = imageDimensions.width;
                tempCanvas.height = imageDimensions.height;
                tempCtx.drawImage(img, 0, 0);
                const info = getRenderedImageInfo();
                if (info && drawPaths.length > 0) {
                    const scaleX = tempCanvas.width / info.renderedW;
                    const scaleY = tempCanvas.height / info.renderedH;
                    tempCtx.lineWidth = 10;
                    tempCtx.lineCap = 'round';
                    tempCtx.lineJoin = 'round';
                    drawPaths.forEach(pathObj => {
                        if (!pathObj.points || pathObj.points.length < 2) return;
                        tempCtx.strokeStyle = pathObj.color;
                        tempCtx.beginPath();
                        tempCtx.moveTo(pathObj.points[0].x * scaleX, pathObj.points[0].y * scaleY);
                        for (let i = 1; i < pathObj.points.length; i++) {
                            tempCtx.lineTo(pathObj.points[i].x * scaleX, pathObj.points[i].y * scaleY);
                        }
                        tempCtx.stroke();
                    });
                }
                resolve(tempCanvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = () => resolve(null);
            img.src = imageDimensions.dataUrl;
        });
    }
    
    init();
});