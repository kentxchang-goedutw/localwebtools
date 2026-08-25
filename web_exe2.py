#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import subprocess
import importlib.util

# ------------------------------------------------------
# PyInstaller 以 --windowed（無主控台）模式打包後，sys.stdout / sys.stderr
# 會是 None。程式內（含 Python 內建的 http.server 每次請求都會呼叫的
# log_message）只要有任何 print() 或寫入 stderr 的動作，就會直接拋出
# AttributeError，導致該執行緒（含處理 HTTP 請求的執行緒）中斷，
# 使瀏覽器端看到「連線意外關閉」而非實際頁面內容。這裡預先補上安全的
# 空輸出物件，避免此問題。
# ------------------------------------------------------
import traceback

def _early_log(msg):
    try:
        p = os.path.join(os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__)), "startup_error.log")
        with open(p, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S') if 'time' in globals() else 'START'}] {msg}\n")
    except Exception:
        pass

def _global_excepthook(exc_type, exc_value, exc_traceback):
    err = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
    _early_log(f"CRASH: {err}")
    try:
        import tkinter.messagebox as mb
        mb.showerror("程式啟動錯誤", f"發生未預期的錯誤：\n\n{err}")
    except Exception:
        pass

sys.excepthook = _global_excepthook
_early_log(f"Script loaded. sys.frozen={getattr(sys, 'frozen', False)}, sys.executable={sys.executable}")

class _NullWriter:
    def write(self, *args, **kwargs):
        pass
    def flush(self):
        pass
    def isatty(self):
        return False

if sys.stdout is None:
    sys.stdout = _NullWriter()
if sys.stderr is None:
    sys.stderr = _NullWriter()

# ------------------------------------------------------
# 啟動時自動檢查必要套件，若缺少則提示使用者是否自動安裝
# ------------------------------------------------------
REQUIRED_PACKAGES = {
    "PyQt5": "PyQt5",
    "PyQt5.QtWebEngineWidgets": "PyQtWebEngine",
    "qrcode": "qrcode",
    "PIL": "Pillow",
}

def _ask_yes_no(title, message):
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        answer = messagebox.askyesno(title, message)
        root.destroy()
        return answer
    except Exception:
        print(f"\n{title}\n{message}")
        reply = input("是否要現在自動安裝？(y/n)：").strip().lower()
        return reply in ("y", "yes", "是")

def _show_message(title, message, error=False):
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        if error:
            messagebox.showerror(title, message)
        else:
            messagebox.showinfo(title, message)
        root.destroy()
    except Exception:
        print(f"\n{title}\n{message}")

def ensure_dependencies():
    # 已封裝為獨立執行檔時，套件已內含在檔案中，不需檢查
    if getattr(sys, "frozen", False):
        return

    missing_specs = []
    seen_pip_names = set()
    for module_name, pip_name in REQUIRED_PACKAGES.items():
        if importlib.util.find_spec(module_name) is None and pip_name not in seen_pip_names:
            missing_specs.append(pip_name)
            seen_pip_names.add(pip_name)

    if not missing_specs:
        return

    pkg_list_text = "\n".join(f"  • {p}" for p in missing_specs)
    should_install = _ask_yes_no(
        "缺少必要套件",
        "偵測到本程式執行需要以下 Python 套件，但目前系統尚未安裝：\n\n"
        f"{pkg_list_text}\n\n"
        "是否要立即自動安裝這些套件？（需要網路連線）\n"
        "安裝完成後程式將自動重新啟動。"
    )
    if not should_install:
        _show_message("已取消安裝", "未安裝必要套件，程式即將結束。", error=True)
        sys.exit(1)

    for pkg in missing_specs:
        print(f"正在安裝套件：{pkg} ...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", pkg])
        except Exception as e:
            _show_message(
                "安裝失敗",
                f"安裝套件 {pkg} 時發生錯誤：\n{e}\n\n請手動開啟命令提示字元執行：\npip install {pkg}",
                error=True
            )
            sys.exit(1)

    _show_message("安裝完成", "必要套件已安裝完成，程式即將重新啟動。")
    os.execv(sys.executable, [sys.executable] + sys.argv)

ensure_dependencies()

# ------------------------------------------------------
# Qt WebEngine（底層為 Chromium）在載入資源檔時，若執行檔所在路徑含有
# 非 ASCII 字元（例如中文資料夾名稱），會直接讀取失敗、閃退，且沒有
# 任何錯誤視窗。若偵測到這種情況，就把整個程式（.exe 及其相依檔案）
# 複製一份到使用者設定檔下的固定 ASCII 路徑（%LOCALAPPDATA%），並改從
# 該處重新啟動；www 等資料仍留在原始資料夾，由 WEBCLASS_ORIGINAL_BASE
# 環境變數記錄，讓 get_base_path() 繼續指向原始位置讀寫。
# ------------------------------------------------------
def _is_ascii(path_str):
    try:
        path_str.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False

def _relocate_if_non_ascii_path():
    if not getattr(sys, "frozen", False):
        return
    if os.environ.get("WEBCLASS_ORIGINAL_BASE"):
        return  # 已經是從 ASCII 暫存路徑重新啟動的程序，避免無限重啟

    # 如果是 --onefile 模式且解壓暫存路徑為 ASCII，QtWebEngine 可直接運作，無需複製重啟
    if hasattr(sys, "_MEIPASS") and _is_ascii(sys._MEIPASS):
        return

    app_dir = os.path.dirname(sys.executable)
    if _is_ascii(app_dir):
        return

    import shutil
    local_app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    staged_dir = os.path.join(local_app_data, "WebClassroomTool", "app")
    staged_exe = os.path.join(staged_dir, os.path.basename(sys.executable))
    marker_path = os.path.join(staged_dir, ".source_stamp")

    try:
        src_stamp = f"{os.path.getsize(sys.executable)}:{os.path.getmtime(sys.executable)}"
        current_stamp = None
        if os.path.isfile(marker_path):
            with open(marker_path, "r", encoding="utf-8") as f:
                current_stamp = f.read().strip()
        if current_stamp != src_stamp or not os.path.isfile(staged_exe):
            if os.path.isdir(staged_dir):
                shutil.rmtree(staged_dir, ignore_errors=True)
            shutil.copytree(
                app_dir, staged_dir,
                ignore=shutil.ignore_patterns(
                    "www", "startup_debug.log", "build", "dist", ".git", "__pycache__"
                )
            )
            with open(marker_path, "w", encoding="utf-8") as f:
                f.write(src_stamp)
        os.environ["WEBCLASS_ORIGINAL_BASE"] = app_dir
        os.execv(staged_exe, [staged_exe] + sys.argv[1:])
    except Exception:
        pass  # 複製或重啟失敗則繼續用原始路徑執行

_relocate_if_non_ascii_path()

# ------------------------------------------------------
# 明確指出 QtWebEngineProcess.exe 的實際位置。PyInstaller 打包後，
# Qt 內建的相對路徑搜尋機制常常找不到這個檔案，導致視窗一開啟、
# WebEngine 初始化失敗就直接閃退（且沒有任何錯誤視窗）。
# ------------------------------------------------------
def _configure_webengine_process_path():
    if not getattr(sys, "frozen", False):
        return
    search_dirs = []
    if hasattr(sys, "_MEIPASS"):
        search_dirs.append(sys._MEIPASS)
    search_dirs.append(os.path.dirname(sys.executable))
    orig_base = os.environ.get("WEBCLASS_ORIGINAL_BASE")
    if orig_base:
        search_dirs.append(orig_base)

    for base in search_dirs:
        if not base or not os.path.exists(base):
            continue
        for rel in (
            os.path.join("PyQt5", "Qt5", "bin", "QtWebEngineProcess.exe"),
            os.path.join("_internal", "PyQt5", "Qt5", "bin", "QtWebEngineProcess.exe"),
            "QtWebEngineProcess.exe"
        ):
            candidate = os.path.join(base, rel)
            if os.path.isfile(candidate):
                os.environ["QTWEBENGINEPROCESS_PATH"] = candidate
                return

_configure_webengine_process_path()

import socket
import urllib.parse
import shutil
import html
import json
import webbrowser
import threading
import time
import uuid

import io
import qrcode

from http.server import SimpleHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from email.parser import BytesParser
from email.policy import default

from PyQt5.QtCore import QThread, pyqtSignal, QUrl, Qt, QRectF, QSize
from PyQt5.QtGui import (QIcon, QPixmap, QImage, QPainter, QColor,
                         QLinearGradient, QPen, QBrush, QFont, QCursor)
from PyQt5.QtWidgets import (QApplication, QMainWindow, QLabel, QVBoxLayout,
                             QWidget, QLineEdit, QPushButton, QHBoxLayout,
                             QFrame, QToolTip, QMessageBox, QSizePolicy,
                             QDialog, QFileDialog)
from PyQt5.QtWebEngineWidgets import QWebEngineView

# 設定 Windows 工作列識別碼，確保獨立顯示自訂 App 圖示
try:
    import ctypes
    myappid = 'teacher.webclassroom.interactive.tool.v2'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

# 用來取得執行檔或腳本所在的根目錄
def get_base_path():
    if getattr(sys, 'frozen', False):
        # 若程式因路徑含非 ASCII 字元而被重新定位執行，仍須讀寫原始資料夾
        # （www、app_icon.png 等），路徑記錄於 WEBCLASS_ORIGINAL_BASE。
        return os.environ.get("WEBCLASS_ORIGINAL_BASE") or os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

# 確保圖示檔案存在，若不存在則自動繪製產生
def ensure_app_icon():
    ico_path = os.path.join(get_base_path(), "app_icon.ico")
    if os.path.exists(ico_path):
        return ico_path
    icon_path = os.path.join(get_base_path(), "app_icon.png")
    if not os.path.exists(icon_path):
        try:
            size = 256
            img = QImage(size, size, QImage.Format_ARGB32)
            img.fill(Qt.transparent)

            painter = QPainter(img)
            painter.setRenderHint(QPainter.Antialiasing)
            painter.setRenderHint(QPainter.SmoothPixmapTransform)

            # 漸層圓角底圖
            grad = QLinearGradient(0, 0, size, size)
            grad.setColorAt(0.0, QColor('#6366F1'))  # 靛藍
            grad.setColorAt(0.5, QColor('#EC4899'))  # 亮粉
            grad.setColorAt(1.0, QColor('#F59E0B'))  # 暖橙

            painter.setPen(Qt.NoPen)
            painter.setBrush(QBrush(grad))
            painter.drawRoundedRect(QRectF(16, 16, 224, 224), 54, 54)

            # 內部高光
            painter.setBrush(QBrush(QColor(255, 255, 255, 45)))
            painter.drawRoundedRect(QRectF(22, 22, 212, 106), 46, 46)

            # 螢幕框
            painter.setPen(QPen(QColor(255, 255, 255, 230), 10, Qt.SolidLine, Qt.RoundCap, Qt.RoundJoin))
            painter.setBrush(Qt.NoBrush)
            painter.drawRoundedRect(QRectF(64, 68, 128, 92), 16, 16)
            painter.drawLine(128, 160, 128, 185)
            painter.drawLine(96, 185, 160, 185)

            # WiFi 波形
            painter.setPen(QPen(QColor(255, 255, 255, 240), 6, Qt.SolidLine, Qt.RoundCap))
            painter.drawArc(QRectF(108, 96, 40, 40), 45 * 16, 90 * 16)
            painter.drawArc(QRectF(98, 86, 60, 60), 45 * 16, 90 * 16)
            painter.setBrush(QBrush(QColor(255, 255, 255, 255)))
            painter.drawEllipse(QRectF(124, 130, 8, 8))

            painter.end()
            img.save(icon_path)
        except Exception as e:
            print("圖示產生失敗:", e)
    return icon_path

# ------------------------------------------------------
# 自動注入給 www/html/ 中所有網頁的截圖繳交外掛組件
# ------------------------------------------------------
SCREENSHOT_INJECTION_HTML = """
<!-- ── 自動注入之浮動截圖作業繳交外掛 ────────────────────────── -->
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<style id="screenshot-plugin-style">
  #floatingScreenshotBtn {
    position: fixed;
    right: 24px;
    bottom: 30px;
    z-index: 999998;
    background: linear-gradient(135deg, #FF6584, #FF8E53);
    color: #ffffff;
    border: 2px solid rgba(255, 255, 255, 0.85);
    border-radius: 50px;
    padding: 12px 22px;
    font-size: 15px;
    font-weight: bold;
    font-family: 'Segoe UI', 'Microsoft JhengHei', -apple-system, sans-serif;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(255, 101, 132, 0.45);
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  #floatingScreenshotBtn:hover {
    transform: translateY(-3px) scale(1.06);
    box-shadow: 0 12px 28px rgba(255, 101, 132, 0.6);
  }
  #floatingScreenshotBtn:active {
    transform: translateY(1px) scale(0.98);
  }

  #screenshotModalOverlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-family: 'Segoe UI', 'Microsoft JhengHei', -apple-system, sans-serif;
  }
  #screenshotModalCard {
    background: #ffffff;
    width: 90%;
    max-width: 480px;
    border-radius: 20px;
    padding: 24px 28px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
    box-sizing: border-box;
    max-height: 90vh;
    overflow-y: auto;
  }
  .sc-modal-title {
    margin: 0 0 16px 0;
    font-size: 20px;
    font-weight: bold;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sc-form-group {
    margin-bottom: 14px;
    text-align: left;
  }
  .sc-form-label {
    display: block;
    font-size: 13px;
    font-weight: bold;
    color: #475569;
    margin-bottom: 6px;
  }
  .sc-form-control {
    width: 100%;
    padding: 9px 12px;
    font-size: 14px;
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.2s;
  }
  .sc-form-control:focus {
    border-color: #38bdf8;
  }
  .sc-preview-box {
    width: 100%;
    max-height: 200px;
    border-radius: 12px;
    border: 2px dashed #cbd5e1;
    background: #f8fafc;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }
  .sc-preview-img {
    max-width: 100%;
    max-height: 200px;
    object-fit: contain;
    display: block;
  }
  .sc-btn-group {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
  }
  .sc-btn {
    padding: 9px 18px;
    font-size: 14px;
    font-weight: bold;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
  }
  .sc-btn-cancel {
    background: #f1f5f9;
    color: #475569;
  }
  .sc-btn-cancel:hover {
    background: #e2e8f0;
  }
  .sc-btn-retake {
    background: #fef08a;
    color: #854d0e;
  }
  .sc-btn-submit {
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
  }
  .sc-btn-submit:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.45);
  }
  .sc-btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  #sc-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 24px;
    border-radius: 25px;
    color: white;
    font-weight: bold;
    font-size: 14px;
    z-index: 1000001;
    display: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }
  #sc-toast.success { background: #10b981; }
  #sc-toast.error { background: #ef4444; }
</style>

<div id="sc-toast"></div>

<!-- 浮動截圖按鈕 -->
<button id="floatingScreenshotBtn" title="截取當前畫面並繳交作業">
  <span>📸</span> 截圖繳交作業
</button>

<!-- 截圖上傳 Modal -->
<div id="screenshotModalOverlay">
  <div id="screenshotModalCard">
    <div class="sc-modal-title">
      <span>📸</span> 畫面截圖作業繳交
    </div>

    <!-- 截圖預覽 -->
    <div class="sc-preview-box">
      <img id="scPreviewImg" class="sc-preview-img" alt="截圖預覽">
    </div>

    <div class="sc-form-group">
      <label class="sc-form-label">選擇繳交題號：</label>
      <select id="scQuestionSelect" class="sc-form-control">
        <option value="問題1">問題 1</option>
        <option value="問題2">問題 2</option>
        <option value="問題3">問題 3</option>
        <option value="問題4">問題 4</option>
        <option value="問題5">問題 5</option>
        <option value="問題6">問題 6</option>
        <option value="問題7">問題 7</option>
        <option value="問題8">問題 8</option>
        <option value="問題9">問題 9</option>
        <option value="問題10">問題 10</option>
      </select>
    </div>

    <div class="sc-form-group">
      <label class="sc-form-label">學生姓名或座號：</label>
      <input type="text" id="scStudentName" class="sc-form-control" placeholder="請輸入姓名或座號 (必填)">
    </div>

    <div class="sc-btn-group">
      <button type="button" id="scBtnCancel" class="sc-btn sc-btn-cancel">取消</button>
      <button type="button" id="scBtnRetake" class="sc-btn sc-btn-retake">🔄 重新截圖</button>
      <button type="button" id="scBtnSubmit" class="sc-btn sc-btn-submit">🚀 確認上傳</button>
    </div>
  </div>
</div>

<script>
(function() {
  let capturedBlob = null;

  function showToast(text, isError = false) {
    const toast = document.getElementById('sc-toast');
    toast.textContent = text;
    toast.className = isError ? 'error' : 'success';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  async function loadQuestions() {
    const sel = document.getElementById('scQuestionSelect');
    if (!sel) return;
    try {
      const res = await fetch('/questions.txt?t=' + new Date().getTime());
      if (res.ok) {
        const text = await res.text();
        const list = text.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);
        if (list.length > 0) {
          const cur = sel.value;
          sel.innerHTML = '';
          list.forEach(q => {
            const opt = document.createElement('option');
            opt.value = q;
            opt.textContent = q;
            sel.appendChild(opt);
          });
          if (list.includes(cur)) sel.value = cur;
        }
      }
    } catch(e) {}
  }

  async function takeScreenshot() {
    const btn = document.getElementById('floatingScreenshotBtn');
    const modal = document.getElementById('screenshotModalOverlay');
    btn.style.display = 'none';
    modal.style.display = 'none';

    await loadQuestions();

    try {
      const canvas = await html2canvas(document.documentElement, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: window.devicePixelRatio || 1
      });

      btn.style.display = 'flex';
      canvas.toBlob(function(blob) {
        capturedBlob = blob;
        const previewImg = document.getElementById('scPreviewImg');
        previewImg.src = URL.createObjectURL(blob);
        modal.style.display = 'flex';
      }, 'image/png');
    } catch (err) {
      btn.style.display = 'flex';
      alert('截圖失敗：' + err.message);
    }
  }

  document.getElementById('floatingScreenshotBtn').addEventListener('click', takeScreenshot);
  document.getElementById('scBtnRetake').addEventListener('click', takeScreenshot);
  document.getElementById('scBtnCancel').addEventListener('click', function() {
    document.getElementById('screenshotModalOverlay').style.display = 'none';
  });

  document.getElementById('scBtnSubmit').addEventListener('click', async function() {
    const nameInput = document.getElementById('scStudentName');
    const studentName = nameInput.value.trim();
    const question = document.getElementById('scQuestionSelect').value;
    const submitBtn = document.getElementById('scBtnSubmit');

    if (!studentName) {
      alert('請先輸入學生姓名或座號！');
      nameInput.focus();
      return;
    }
    if (!capturedBlob) {
      alert('尚未取得截圖，請重新截圖！');
      return;
    }

    let fileName = studentName;
    if (!fileName.toLowerCase().endsWith('.png')) {
      fileName += '.png';
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 上傳中...';

    const formData = new FormData();
    formData.append('question', question);
    formData.append('name', fileName);
    formData.append('file', capturedBlob, fileName);

    try {
      const res = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('伺服器回應錯誤');
      
      document.getElementById('screenshotModalOverlay').style.display = 'none';
      showToast('🎉 截圖作業已成功繳交至伺服器！');
      alert(`🎉 作業已成功上傳至【${question}】！`);
    } catch (err) {
      alert('上傳失敗：' + err.message);
      showToast('上傳失敗：' + err.message, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 確認上傳';
    }
  });
})();
</script>
"""

# ------------------------------------------------------
# 解析 multipart/form-data 表單資料
# ------------------------------------------------------
def parse_multipart_formdata(headers, rfile):
    try:
        content_length = int(headers.get("Content-Length", 0))
    except ValueError:
        content_length = 0
    data = rfile.read(content_length)
    content_type = headers.get("Content-Type")
    message_bytes = b"Content-Type: " + content_type.encode("utf-8") + b"\r\n\r\n" + data
    msg = BytesParser(policy=default).parsebytes(message_bytes)
    form = {}
    if msg.is_multipart():
        for part in msg.iter_parts():
            name = part.get_param("name", header="Content-Disposition")
            if name:
                filename = part.get_param("filename", header="Content-Disposition")
                content = part.get_payload(decode=True)
                form[name] = {"filename": filename, "content": content}
    return form

# ------------------------------------------------------
# 本地 Document DB (供白板、簡報及其他互動工具共用)
# ------------------------------------------------------
class LocalDocDB:
    def __init__(self, persistence_file=None, quiz_dir=None):
        self.lock = threading.RLock()
        self.docs = {}
        self.doc_versions = {}
        self.global_version = 0
        self.persistence_file = persistence_file
        # 題庫 (quizzes 集合) 各自獨立存放為 www/quiz/<id>.json，不混在主要的 local_db.json 內
        self.quiz_dir = quiz_dir
        self.load()

    def _normalize_path(self, path):
        if not path:
            return ""
        parts = [p.strip('/') for p in str(path).split('/') if p.strip('/')]
        return '/'.join(parts)

    def _quiz_file_path(self, doc_id):
        safe_id = str(doc_id).replace('/', '_').replace('\\', '_').replace('..', '_')
        return os.path.join(self.quiz_dir, f"{safe_id}.json")

    def load(self):
        if self.persistence_file and os.path.exists(self.persistence_file):
            try:
                with open(self.persistence_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.docs = data.get("docs", {})
                    self.global_version = data.get("version", 0)
            except Exception as e:
                print("載入 LocalDocDB 失敗:", e)

        # 偵測是否有舊版混雜在 local_db.json 內的題庫資料，稍後需要搬移至獨立檔案
        legacy_quiz_found = any(k.startswith('quizzes/') for k in self.docs)

        if self.quiz_dir:
            try:
                os.makedirs(self.quiz_dir, exist_ok=True)
                for fname in os.listdir(self.quiz_dir):
                    if fname.lower().endswith('.json'):
                        fpath = os.path.join(self.quiz_dir, fname)
                        try:
                            with open(fpath, 'r', encoding='utf-8') as f:
                                quiz_data = json.load(f)
                            doc_id = os.path.splitext(fname)[0]
                            self.docs[f"quizzes/{doc_id}"] = quiz_data
                        except Exception as e:
                            print(f"載入題庫檔案失敗 {fname}:", e)
            except Exception as e:
                print("讀取題庫資料夾失敗:", e)

        if legacy_quiz_found:
            # 立即將舊資料搬移至獨立檔案，並從 local_db.json 中移除
            self.save()

    def save(self):
        if self.quiz_dir:
            try:
                os.makedirs(self.quiz_dir, exist_ok=True)
                existing_ids_on_disk = set()
                for fname in os.listdir(self.quiz_dir):
                    if fname.lower().endswith('.json'):
                        existing_ids_on_disk.add(os.path.splitext(fname)[0])

                current_quiz_ids = set()
                for path, doc in self.docs.items():
                    if path.startswith('quizzes/'):
                        doc_id = path.split('/', 1)[1]
                        current_quiz_ids.add(doc_id)
                        try:
                            with open(self._quiz_file_path(doc_id), 'w', encoding='utf-8') as f:
                                json.dump(doc, f, ensure_ascii=False, indent=2)
                        except Exception as e:
                            print(f"寫入題庫檔案失敗 {doc_id}:", e)

                # 移除已刪除題庫殘留的檔案
                for old_id in existing_ids_on_disk - current_quiz_ids:
                    try:
                        os.remove(self._quiz_file_path(old_id))
                    except Exception:
                        pass
            except Exception as e:
                print("儲存題庫檔案失敗:", e)

        if self.persistence_file:
            try:
                os.makedirs(os.path.dirname(self.persistence_file), exist_ok=True)
                # 題庫已改存放於獨立檔案，主要資料庫檔案不再重複保存 quizzes 集合
                docs_to_persist = {k: v for k, v in self.docs.items() if not k.startswith('quizzes/')}
                with open(self.persistence_file, 'w', encoding='utf-8') as f:
                    json.dump({"docs": docs_to_persist, "version": self.global_version}, f, ensure_ascii=False)
            except Exception as e:
                print("儲存 LocalDocDB 失敗:", e)

    def set_doc(self, path, data, merge=False):
        path = self._normalize_path(path)
        with self.lock:
            self.global_version += 1
            now = time.time()
            if merge and path in self.docs:
                doc = dict(self.docs[path])
                for k, v in data.items():
                    if '.' in k:
                        keys = k.split('.')
                        curr = doc
                        for sub_k in keys[:-1]:
                            if sub_k not in curr or not isinstance(curr[sub_k], dict):
                                curr[sub_k] = {}
                            curr = curr[sub_k]
                        curr[keys[-1]] = v
                    else:
                        doc[k] = v
                doc['_updatedAt'] = now
                self.docs[path] = doc
            else:
                doc = dict(data)
                final_doc = {}
                for k, v in doc.items():
                    if '.' in k:
                        keys = k.split('.')
                        curr = final_doc
                        for sub_k in keys[:-1]:
                            if sub_k not in curr or not isinstance(curr[sub_k], dict):
                                curr[sub_k] = {}
                            curr = curr[sub_k]
                        curr[keys[-1]] = v
                    else:
                        final_doc[k] = v
                final_doc['_updatedAt'] = now
                self.docs[path] = final_doc
            
            self.doc_versions[path] = self.global_version
            self.save()
            return {"status": "ok", "path": path, "version": self.global_version}

    def update_doc(self, path, data):
        return self.set_doc(path, data, merge=True)

    def add_doc(self, col_path, data):
        col_path = self._normalize_path(col_path)
        doc_id = str(uuid.uuid4()).replace('-', '')[:16]
        path = f"{col_path}/{doc_id}"
        self.set_doc(path, data, merge=False)
        return {"status": "ok", "id": doc_id, "path": path}

    def get_doc(self, path):
        path = self._normalize_path(path)
        with self.lock:
            doc = self.docs.get(path)
            if doc is None:
                return {"exists": False, "data": None, "id": path.split('/')[-1] if path else ""}
            return {"exists": True, "data": doc, "id": path.split('/')[-1]}

    def delete_doc(self, path):
        path = self._normalize_path(path)
        with self.lock:
            self.global_version += 1
            deleted_keys = [k for k in self.docs if k == path or k.startswith(path + "/")]
            for k in deleted_keys:
                del self.docs[k]
                self.doc_versions[k] = self.global_version
            self.save()
            return {"status": "ok", "deleted": len(deleted_keys)}

    def get_collection(self, col_path, where_clauses=None):
        col_path = self._normalize_path(col_path)
        with self.lock:
            results = []
            prefix = col_path + "/" if col_path else ""
            for k, v in self.docs.items():
                if not col_path or k.startswith(prefix):
                    sub = k[len(prefix):] if col_path else k
                    if '/' not in sub:
                        doc_id = sub
                        doc_data = dict(v)
                        match = True
                        if where_clauses:
                            for field, op, val in where_clauses:
                                cur_val = doc_data.get(field)
                                if op == "==" and cur_val != val:
                                    match = False
                                    break
                                elif op == ">" and (cur_val is None or cur_val <= val):
                                    match = False
                                    break
                        if match:
                            results.append({"id": doc_id, "data": doc_data})
            return {"status": "ok", "docs": results}

    def batch(self, operations):
        with self.lock:
            for op in operations:
                action = op.get("action")
                path = op.get("path")
                data = op.get("data", {})
                merge = op.get("merge", False)
                if action == "set":
                    self.set_doc(path, data, merge=merge)
                elif action == "update":
                    self.update_doc(path, data)
                elif action == "delete":
                    self.delete_doc(path)
            return {"status": "ok", "count": len(operations)}

# 初始化全域 LocalDocDB 實例
global_doc_db = LocalDocDB(
    persistence_file=os.path.join(get_base_path(), "www", "data", "local_db.json"),
    quiz_dir=os.path.join(get_base_path(), "www", "quiz")
)

# ---------------------------
# HTTP 伺服器相關類別（多執行緒）
# ---------------------------
class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class MyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.directory = os.path.join(get_base_path(), "www")
        super().__init__(*args, directory=self.directory, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, PUT")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 1. LocalDB API 路由
        if parsed.path == "/api/db/get":
            qs = urllib.parse.parse_qs(parsed.query)
            path = qs.get("path", [""])[0]
            parts = [p for p in path.split('/') if p]
            is_col = (len(parts) % 2 == 1)
            if is_col:
                res = global_doc_db.get_collection(path)
            else:
                res = global_doc_db.get_doc(path)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            return

        elif parsed.path == "/api/db/all":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"docs": global_doc_db.docs, "version": global_doc_db.global_version}, ensure_ascii=False).encode("utf-8"))
            return

        # 2. 原有檔案清單 API
        elif self.path.startswith("/api/list"):
            qs = urllib.parse.parse_qs(parsed.query)
            rel_path = qs.get("path", [""])[0]
            listing_json = self.generate_directory_listing_json(rel_path)
            self.send_response(200)
            self.send_header("Content-type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(listing_json.encode("utf-8"))
            return
        else:
            if self.path == "/":
                self.path = "/index.html"
            
            # 檢查是否為 www/html/ 子目錄下的 HTML 檔案
            parsed_path = urllib.parse.urlparse(self.path).path
            clean_path = urllib.parse.unquote(parsed_path)
            if clean_path.startswith("/html/") and clean_path.lower().endswith((".html", ".htm")):
                rel_file = clean_path.lstrip("/")
                full_file = os.path.join(self.directory, rel_file)
                if os.path.isfile(full_file):
                    try:
                        with open(full_file, "r", encoding="utf-8") as f:
                            content = f.read()
                    except UnicodeDecodeError:
                        try:
                            with open(full_file, "r", encoding="cp950") as f:
                                content = f.read()
                        except Exception:
                            with open(full_file, "r", encoding="latin-1") as f:
                                content = f.read()
                    
                    # 自動在 </body> 之前注入截圖外掛
                    if "</body>" in content:
                        injected_content = content.replace("</body>", f"{SCREENSHOT_INJECTION_HTML}\n</body>")
                    else:
                        injected_content = content + SCREENSHOT_INJECTION_HTML
                    
                    encoded = injected_content.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(encoded)))
                    self.end_headers()
                    self.wfile.write(encoded)
                    return

            return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        # 1. LocalDB API 路由
        if parsed.path.startswith("/api/db/"):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
            try:
                body = json.loads(post_data) if post_data else {}
            except Exception:
                body = {}

            if parsed.path == "/api/db/set":
                res = global_doc_db.set_doc(body.get("path", ""), body.get("data", {}), merge=body.get("merge", False))
            elif parsed.path == "/api/db/update":
                res = global_doc_db.update_doc(body.get("path", ""), body.get("data", {}))
            elif parsed.path == "/api/db/add":
                res = global_doc_db.add_doc(body.get("path", ""), body.get("data", {}))
            elif parsed.path == "/api/db/delete":
                res = global_doc_db.delete_doc(body.get("path", ""))
            elif parsed.path == "/api/db/query":
                res = global_doc_db.get_collection(body.get("path", ""), where_clauses=body.get("where"))
            elif parsed.path == "/api/db/batch":
                res = global_doc_db.batch(body.get("operations", []))
            else:
                res = {"status": "error", "message": "Unknown API route"}

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))
            return

        # 2. 原有檔案上傳及設定 API
        elif self.path == "/upload":
            form = parse_multipart_formdata(self.headers, self.rfile)
            name_field_data = form.get("name")
            file_field_data = form.get("file")
            question = ""
            if "question" in form:
                try:
                    question = form["question"]["content"].decode("utf-8").strip()
                except Exception:
                    question = ""
            if name_field_data and file_field_data and file_field_data.get("filename"):
                try:
                    name_field_value = name_field_data["content"].decode("utf-8").strip()
                except Exception:
                    name_field_value = "uploaded_file"
                
                base_upload_dir = os.path.join(get_base_path(), "www", "upload")
                if question:
                    target_dir = os.path.join(base_upload_dir, question)
                else:
                    target_dir = base_upload_dir
                if not os.path.exists(target_dir):
                    os.makedirs(target_dir)
                filename = os.path.basename(name_field_value)
                filepath = os.path.join(target_dir, filename)
                try:
                    with open(filepath, "wb") as f:
                        f.write(file_field_data["content"])
                    self.send_response(303)
                    self.send_header("Location", "/")
                    self.end_headers()
                except Exception as e:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write("檔案上傳失敗：{}".format(e).encode("utf-8"))
            else:
                self.send_response(400)
                self.end_headers()
                self.wfile.write("上傳失敗，請確認所有欄位都有填寫。".encode("utf-8"))
        elif self.path == "/setBg":
            form = parse_multipart_formdata(self.headers, self.rfile)
            question_field = form.get("question")
            file_field_data = form.get("file")
            if question_field and file_field_data and file_field_data.get("filename"):
                try:
                    question_value = question_field["content"].decode("utf-8").strip()
                except Exception:
                    question_value = ""
                filename = os.path.basename(file_field_data["filename"])
                base_bg_dir = os.path.join(get_base_path(), "www", "bg")
                if not os.path.exists(base_bg_dir):
                    os.makedirs(base_bg_dir)
                filepath = os.path.join(base_bg_dir, filename)
                try:
                    with open(filepath, "wb") as f:
                        f.write(file_field_data["content"])
                    
                    # 同步寫入以 question_value 命名的檔案以相容自訂選單
                    if question_value:
                        _, ext = os.path.splitext(filename)
                        if not ext:
                            ext = ".png"
                        name1 = f"{question_value}{ext}"
                        name2 = f"q{question_value}{ext}"
                        path1 = os.path.join(base_bg_dir, name1)
                        path2 = os.path.join(base_bg_dir, name2)
                        if path1 != filepath:
                            with open(path1, "wb") as f:
                                f.write(file_field_data["content"])
                        if path2 != filepath and path2 != path1:
                            with open(path2, "wb") as f:
                                f.write(file_field_data["content"])

                    self.send_response(303)
                    self.send_header("Location", "/")
                    self.end_headers()
                except Exception as e:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write("背景圖設定失敗：{}".format(e).encode("utf-8"))
            else:
                self.send_response(400)
                self.end_headers()
                self.wfile.write("背景圖設定失敗，請確認所有欄位都有填寫。".encode("utf-8"))
        elif self.path == "/saveUrls":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length).decode('utf-8')
                
                # 判斷是否為 JSON
                url_text = ""
                try:
                    json_data = json.loads(post_data)
                    if isinstance(json_data, dict) and "content" in json_data:
                        url_text = json_data["content"]
                    elif isinstance(json_data, list):
                        lines = []
                        for item in json_data:
                            u = item.get("url", "").strip()
                            n = item.get("name", "").strip()
                            if u:
                                lines.append(f"{u},{n}" if n else u)
                        url_text = "\n".join(lines)
                    else:
                        url_text = post_data
                except Exception:
                    url_text = post_data

                url_file_path = os.path.join(get_base_path(), "www", "url.txt")
                with open(url_file_path, "w", encoding="utf-8") as f:
                    f.write(url_text.strip() + "\n")

                self.send_response(200)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "網址清單已成功儲存！"}, ensure_ascii=False).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False).encode("utf-8"))
        elif self.path == "/saveQuestions":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length).decode('utf-8')
                
                # 判斷是否為 JSON
                q_text = ""
                try:
                    json_data = json.loads(post_data)
                    if isinstance(json_data, dict) and "content" in json_data:
                        q_text = json_data["content"]
                    elif isinstance(json_data, list):
                        lines = [str(item).strip() for item in json_data if str(item).strip()]
                        q_text = "\n".join(lines)
                    else:
                        q_text = post_data
                except Exception:
                    q_text = post_data

                q_file_path = os.path.join(get_base_path(), "www", "questions.txt")
                with open(q_file_path, "w", encoding="utf-8") as f:
                    f.write(q_text.strip() + "\n")

                self.send_response(200)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "上傳選單名稱已成功儲存！"}, ensure_ascii=False).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False).encode("utf-8"))
        else:
            self.send_error(404)

    def generate_directory_listing_json(self, rel_path):
        base = os.path.realpath(self.directory)
        target_dir = os.path.realpath(os.path.join(self.directory, rel_path))
        if not target_dir.startswith(base):
            target_dir = base
            rel_path = ""
        items = []
        try:
            entries = os.listdir(target_dir)
        except OSError:
            entries = []
        for entry in entries:
            full_item = os.path.join(target_dir, entry)
            is_dir = os.path.isdir(full_item)
            item_rel_path = os.path.join(rel_path, entry).replace("\\", "/")
            items.append({
                "name": entry,
                "isDir": is_dir,
                "path": item_rel_path
            })
        return json.dumps(items, ensure_ascii=False)

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

class HTTPServerThread(QThread):
    server_started = pyqtSignal(str)
    server_error = pyqtSignal(str)
    def __init__(self, port, parent=None):
        super().__init__(parent)
        self.port = port
        self.httpd = None
    def run(self):
        try:
            server_address = ('', self.port)
            self.httpd = ThreadedHTTPServer(server_address, MyHandler)
        except OSError as e:
            self.server_error.emit(str(e))
            return
        ip = get_local_ip()
        url = f"http://{ip}:{self.port}"
        self.server_started.emit(url)
        self.httpd.serve_forever()
    def stop(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()

# ---------------------------
# 學生連線 QR Code 彈出對話框
# ---------------------------
class QRCodeDialog(QDialog):
    def __init__(self, url, parent=None):
        super().__init__(parent)
        self.url = url
        self.pixmap = None
        self.setWindowTitle("📱 學生掃描 QR Code 連線")
        self.setFixedSize(460, 560)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowContextHelpButtonHint)
        self.initUI()

    def initUI(self):
        self.setStyleSheet("""
            QDialog {
                background: #0F172A;
                font-family: "Segoe UI", "Microsoft JhengHei", sans-serif;
            }
            QLabel#qrTitle {
                color: #F8FAFC;
                font-size: 18px;
                font-weight: bold;
            }
            QLabel#qrSubtitle {
                color: #94A3B8;
                font-size: 13px;
                line-height: 1.4;
            }
            QLabel#qrImageLabel {
                background: #FFFFFF;
                border: 3px solid #38BDF8;
                border-radius: 16px;
                padding: 12px;
            }
            QLabel#urlDisplay {
                color: #38BDF8;
                font-size: 15px;
                font-weight: bold;
                background: rgba(56, 189, 248, 0.12);
                border: 1px solid rgba(56, 189, 248, 0.3);
                border-radius: 8px;
                padding: 6px 12px;
            }
            QPushButton#btnCopy {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0284C7, stop:1 #38BDF8);
                color: white;
                font-weight: bold;
                font-size: 13px;
                border: none;
                border-radius: 8px;
                padding: 8px 16px;
            }
            QPushButton#btnCopy:hover {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0369A1, stop:1 #0284C7);
            }
            QPushButton#btnSave {
                background: rgba(255, 255, 255, 0.12);
                color: #F1F5F9;
                font-weight: 500;
                font-size: 13px;
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 8px;
                padding: 8px 16px;
            }
            QPushButton#btnSave:hover {
                background: rgba(255, 255, 255, 0.22);
            }
            QPushButton#btnClose {
                background: rgba(255, 255, 255, 0.08);
                color: #94A3B8;
                font-size: 13px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                padding: 8px 16px;
            }
            QPushButton#btnClose:hover {
                background: rgba(255, 255, 255, 0.15);
                color: white;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)
        layout.setAlignment(Qt.AlignCenter)

        # 標題與說明
        titleLabel = QLabel("📱 學生掃描 QR Code 連線")
        titleLabel.setObjectName("qrTitle")
        titleLabel.setAlignment(Qt.AlignCenter)
        layout.addWidget(titleLabel)

        subLabel = QLabel("請學生開啟平板或手機相機，掃描下方 QR Code 進入系統：")
        subLabel.setObjectName("qrSubtitle")
        subLabel.setAlignment(Qt.AlignCenter)
        subLabel.setWordWrap(True)
        layout.addWidget(subLabel)

        # QR Code 圖片
        self.qrLabel = QLabel()
        self.qrLabel.setObjectName("qrImageLabel")
        self.qrLabel.setAlignment(Qt.AlignCenter)
        self.qrLabel.setFixedSize(290, 290)
        self.generateQRCode()
        layout.addWidget(self.qrLabel, 0, Qt.AlignCenter)

        # 網址文字
        self.urlLabel = QLabel(self.url)
        self.urlLabel.setObjectName("urlDisplay")
        self.urlLabel.setAlignment(Qt.AlignCenter)
        self.urlLabel.setCursor(QCursor(Qt.PointingHandCursor))
        self.urlLabel.setToolTip("點擊複製網址")
        self.urlLabel.mousePressEvent = self.copyUrl
        layout.addWidget(self.urlLabel)

        # 按鈕列
        btnLayout = QHBoxLayout()
        btnLayout.setSpacing(10)

        copyBtn = QPushButton("📋 複製網址")
        copyBtn.setObjectName("btnCopy")
        copyBtn.setCursor(QCursor(Qt.PointingHandCursor))
        copyBtn.clicked.connect(self.copyUrl)
        btnLayout.addWidget(copyBtn)

        saveBtn = QPushButton("💾 儲存圖片")
        saveBtn.setObjectName("btnSave")
        saveBtn.setCursor(QCursor(Qt.PointingHandCursor))
        saveBtn.clicked.connect(self.saveQRImage)
        btnLayout.addWidget(saveBtn)

        closeBtn = QPushButton("✕ 關閉")
        closeBtn.setObjectName("btnClose")
        closeBtn.setCursor(QCursor(Qt.PointingHandCursor))
        closeBtn.clicked.connect(self.accept)
        btnLayout.addWidget(closeBtn)

        layout.addLayout(btnLayout)

    def generateQRCode(self):
        try:
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=10,
                border=2,
            )
            qr.add_data(self.url)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            
            qimg = QImage()
            qimg.loadFromData(buffer.getvalue())
            self.pixmap = QPixmap.fromImage(qimg).scaled(260, 260, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            self.qrLabel.setPixmap(self.pixmap)
        except Exception as e:
            self.qrLabel.setText(f"QR Code 生成失敗\n{e}")

    def copyUrl(self, event=None):
        QApplication.clipboard().setText(self.url)
        QToolTip.showText(QCursor.pos(), "✅ 網址已複製到剪貼簿！", self, QRectF(), 1500)

    def saveQRImage(self):
        if not self.pixmap:
            return
        filePath, _ = QFileDialog.getSaveFileName(
            self, "儲存 QR Code 圖片", "qrcode.png", "PNG 圖片 (*.png);;所有檔案 (*.*)"
        )
        if filePath:
            try:
                self.pixmap.save(filePath, "PNG")
                QMessageBox.information(self, "儲存成功", f"🎉 QR Code 已成功儲存至：\n{filePath}")
            except Exception as e:
                QMessageBox.critical(self, "儲存失敗", f"儲存時發生錯誤：\n{e}")

# ---------------------------
# PyQt5 現代化緊湊主視窗
# ---------------------------
class MainWindow(QMainWindow):
    def __init__(self, server_thread, port):
        super().__init__()
        self.server_thread = None
        self.port = port
        self.current_url = f"http://127.0.0.1:{port}"

        self.setWindowTitle("WEB 區網互動教學工具箱")
        self.resize(1120, 780)

        # 設定視窗與工作列圖示
        icon_path = ensure_app_icon()
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))

        self.initUI()
        self._wireServerThread(server_thread)

    def _wireServerThread(self, server_thread):
        self.server_thread = server_thread
        self.server_thread.server_started.connect(self.onServerStarted)
        self.server_thread.server_error.connect(self.onServerError)

    def onServerStarted(self, url):
        self.current_url = url
        self.urlTextLabel.setText(url)
        self.statusBadge.setText("🟢 伺服器運行中")
        self.statusBadge.setStyleSheet("")
        self.webview.load(QUrl(url))

    def onServerError(self, message):
        self.statusBadge.setText("🔴 伺服器啟動失敗")
        self.statusBadge.setStyleSheet("color: #F87171; background: rgba(248, 113, 113, 0.15); border: 1px solid rgba(248, 113, 113, 0.3);")
        QMessageBox.critical(
            self, "伺服器啟動失敗",
            f"無法啟動本機網頁伺服器（Port {self.port}）：\n{message}\n\n"
            "這通常表示該連接埠已被其他程式佔用。\n"
            "請在上方變更 Port 數值後，按下「⚡ 重啟伺服器」再試一次。"
        )

    def initUI(self):
        centralWidget = QWidget()
        centralWidget.setObjectName("centralWidget")
        mainLayout = QVBoxLayout(centralWidget)
        mainLayout.setContentsMargins(0, 0, 0, 0)
        mainLayout.setSpacing(0)

        # 頂部控制列（固定緊湊高度 48px）
        topBar = QFrame()
        topBar.setObjectName("topBar")
        topBar.setFixedHeight(48)
        topBarLayout = QHBoxLayout(topBar)
        topBarLayout.setContentsMargins(14, 6, 14, 6)
        topBarLayout.setSpacing(10)

        # 伺服器狀態標籤
        self.statusBadge = QLabel("🟢 伺服器運行中")
        self.statusBadge.setObjectName("statusBadge")
        self.statusBadge.setFixedHeight(28)
        topBarLayout.addWidget(self.statusBadge)

        # 分隔線
        sep1 = QFrame()
        sep1.setFrameShape(QFrame.VLine)
        sep1.setObjectName("separator")
        sep1.setFixedHeight(20)
        topBarLayout.addWidget(sep1)

        # 網址顯示標籤
        self.urlTitleLabel = QLabel("連線網址：")
        self.urlTitleLabel.setObjectName("urlTitleLabel")
        self.urlTitleLabel.setFixedHeight(28)
        topBarLayout.addWidget(self.urlTitleLabel)

        self.urlTextLabel = QLabel(self.current_url)
        self.urlTextLabel.setObjectName("urlTextLabel")
        self.urlTextLabel.setFixedHeight(28)
        self.urlTextLabel.setCursor(QCursor(Qt.PointingHandCursor))
        self.urlTextLabel.setToolTip("點擊複製網址")
        self.urlTextLabel.mousePressEvent = self.copyUrlToClipboard
        topBarLayout.addWidget(self.urlTextLabel)

        # 複製網址按鈕
        self.copyBtn = QPushButton("📋 複製")
        self.copyBtn.setObjectName("actionBtn")
        self.copyBtn.setFixedHeight(28)
        self.copyBtn.setToolTip("複製連線網址給學生")
        self.copyBtn.clicked.connect(self.copyUrlToClipboard)
        topBarLayout.addWidget(self.copyBtn)

        # 顯示 QR Code 按鈕
        self.qrCodeBtn = QPushButton("📱 QR Code")
        self.qrCodeBtn.setObjectName("actionBtn")
        self.qrCodeBtn.setFixedHeight(28)
        self.qrCodeBtn.setToolTip("開啟大尺寸 QR Code 供學生平板/手機掃描連線")
        self.qrCodeBtn.clicked.connect(self.showQRCodeDialog)
        topBarLayout.addWidget(self.qrCodeBtn)

        # 外部瀏覽器開啟按鈕
        self.openBrowserBtn = QPushButton("🌐 瀏覽器開啟")
        self.openBrowserBtn.setObjectName("actionBtn")
        self.openBrowserBtn.setFixedHeight(28)
        self.openBrowserBtn.setToolTip("在系統預設瀏覽器中開啟此網址")
        self.openBrowserBtn.clicked.connect(self.openInExternalBrowser)
        topBarLayout.addWidget(self.openBrowserBtn)

        # 重新整理按鈕
        self.refreshBtn = QPushButton("🔄 重新整理")
        self.refreshBtn.setObjectName("actionBtn")
        self.refreshBtn.setFixedHeight(28)
        self.refreshBtn.setToolTip("重新載入內嵌網頁")
        self.refreshBtn.clicked.connect(self.refreshWebView)
        topBarLayout.addWidget(self.refreshBtn)

        # 分隔線 2
        sep2 = QFrame()
        sep2.setFrameShape(QFrame.VLine)
        sep2.setObjectName("separator")
        sep2.setFixedHeight(20)
        topBarLayout.addWidget(sep2)

        # Port 設定區
        portLabel = QLabel("Port：")
        portLabel.setObjectName("portLabel")
        portLabel.setFixedHeight(28)
        topBarLayout.addWidget(portLabel)

        self.portLineEdit = QLineEdit()
        self.portLineEdit.setObjectName("portLineEdit")
        self.portLineEdit.setText(str(self.port))
        self.portLineEdit.setFixedWidth(64)
        self.portLineEdit.setFixedHeight(28)
        self.portLineEdit.setAlignment(Qt.AlignCenter)
        topBarLayout.addWidget(self.portLineEdit)

        self.restartBtn = QPushButton("⚡ 重啟伺服器")
        self.restartBtn.setObjectName("restartBtn")
        self.restartBtn.setFixedHeight(28)
        self.restartBtn.setToolTip("變更 Port 後重新啟動伺服器")
        self.restartBtn.clicked.connect(self.restartServer)
        topBarLayout.addWidget(self.restartBtn)

        topBarLayout.addStretch()

        # 右側作者與 CC 授權標籤
        self.authorLabel = QLabel(
            '<span style="color:#CBD5E1; font-size:12px;">Made by </span>'
            '<a href="https://kentxchang.blogspot.tw" style="color:#A78BFA; text-decoration:none; font-weight:bold; font-size:12px;">阿剛老師</a>'
            '<span style="color:#94A3B8; font-size:11px;"> ｜ CC BY-NC-SA 4.0 授權</span>'
        )
        self.authorLabel.setObjectName("authorLabel")
        self.authorLabel.setTextFormat(Qt.RichText)
        self.authorLabel.setTextInteractionFlags(Qt.TextBrowserInteraction)
        self.authorLabel.setOpenExternalLinks(True)
        self.authorLabel.setFixedHeight(28)
        topBarLayout.addWidget(self.authorLabel)

        # 將 topBar (stretch=0) 與 webview (stretch=1) 加入 mainLayout
        mainLayout.addWidget(topBar, 0)

        # 內嵌網頁檢視器（先顯示啟動中畫面，待伺服器確認啟動後才載入實際網址，避免競速造成空白頁）
        self.webview = QWebEngineView()
        self.webview.setObjectName("webview")
        self.webview.setHtml(
            "<html><body style='display:flex;align-items:center;justify-content:center;"
            "height:100vh;margin:0;font-family:Segoe UI,Microsoft JhengHei,sans-serif;"
            "background:#0F172A;color:#94A3B8;'>"
            "<div>🚀 伺服器啟動中，請稍候...</div></body></html>"
        )
        mainLayout.addWidget(self.webview, 1)

        self.setCentralWidget(centralWidget)
        self.applyModernStyle()

    def applyModernStyle(self):
        qss = """
        QWidget#centralWidget {
            background-color: #F8FAFC;
            font-family: "Segoe UI", "Microsoft JhengHei", "PingFang TC", sans-serif;
        }
        
        QFrame#topBar {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #1E293B, stop:1 #334155);
            border-bottom: 2px solid #475569;
        }

        QLabel#statusBadge {
            color: #4ADE80;
            font-weight: bold;
            font-size: 13px;
            background: rgba(74, 222, 128, 0.15);
            border: 1px solid rgba(74, 222, 128, 0.3);
            border-radius: 6px;
            padding: 2px 8px;
        }

        QFrame#separator {
            color: #475569;
            background: #475569;
            width: 1px;
        }

        QLabel#urlTitleLabel {
            color: #94A3B8;
            font-size: 13px;
            font-weight: 500;
        }

        QLabel#urlTextLabel {
            color: #38BDF8;
            font-size: 14px;
            font-weight: bold;
            background: rgba(56, 189, 248, 0.12);
            border: 1px solid rgba(56, 189, 248, 0.25);
            border-radius: 6px;
            padding: 2px 8px;
        }
        QLabel#urlTextLabel:hover {
            color: #7DD3FC;
            background: rgba(56, 189, 248, 0.22);
        }

        QPushButton#actionBtn {
            background: rgba(255, 255, 255, 0.1);
            color: #F1F5F9;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            padding: 3px 10px;
            font-size: 13px;
            font-weight: 500;
        }
        QPushButton#actionBtn:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.4);
        }
        QPushButton#actionBtn:pressed {
            background: rgba(255, 255, 255, 0.05);
        }

        QLabel#portLabel {
            color: #CBD5E1;
            font-size: 13px;
            font-weight: bold;
        }

        QLineEdit#portLineEdit {
            background: #0F172A;
            color: #38BDF8;
            border: 1.5px solid #475569;
            border-radius: 6px;
            padding: 2px 4px;
            font-size: 13px;
            font-weight: bold;
        }
        QLineEdit#portLineEdit:focus {
            border-color: #38BDF8;
        }

        QPushButton#restartBtn {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0284C7, stop:1 #38BDF8);
            color: #FFFFFF;
            border: none;
            border-radius: 6px;
            padding: 4px 12px;
            font-size: 13px;
            font-weight: bold;
        }
        QPushButton#restartBtn:hover {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0369A1, stop:1 #0284C7);
        }
        QPushButton#restartBtn:pressed {
            background: #075985;
        }

        QLabel#authorLabel {
            background: rgba(255, 255, 255, 0.06);
            border-radius: 6px;
            padding: 2px 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        QToolTip {
            background-color: #1E293B;
            color: #FFFFFF;
            border: 1px solid #475569;
            border-radius: 6px;
            padding: 5px;
            font-size: 12px;
        }
        """
        self.setStyleSheet(qss)

    def copyUrlToClipboard(self, event=None):
        clipboard = QApplication.clipboard()
        clipboard.setText(self.current_url)
        QToolTip.showText(QCursor.pos(), "✅ 網址已複製到剪貼簿！", self, QRectF(), 1500)

    def openInExternalBrowser(self):
        webbrowser.open(self.current_url)

    def showQRCodeDialog(self):
        dialog = QRCodeDialog(self.current_url, self)
        dialog.exec_()

    def refreshWebView(self):
        self.webview.reload()
        QToolTip.showText(QCursor.pos(), "🔄 已重新整理", self, QRectF(), 1000)

    def restartServer(self):
        new_port_str = self.portLineEdit.text().strip()
        try:
            new_port = int(new_port_str)
            if new_port < 1 or new_port > 65535:
                raise ValueError()
        except Exception:
            QMessageBox.warning(self, "連接埠錯誤", "請輸入有效的 Port 數值 (1 ~ 65535)！")
            return

        self.statusBadge.setText("🟡 重啟中...")
        self.statusBadge.setStyleSheet("color: #FBBF24; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.3);")
        QApplication.processEvents()

        self.server_thread.stop()
        self.server_thread.wait()

        self.port = new_port
        new_thread = HTTPServerThread(new_port)
        self._wireServerThread(new_thread)
        new_thread.start()

        QToolTip.showText(QCursor.pos(), f"🚀 正在 Port {new_port} 重新啟動伺服器...", self, QRectF(), 2000)

def _write_startup_log(base_path, www_dir, index_existed_before_setup, port):
    try:
        log_path = os.path.join(base_path, "startup_debug.log")
        lines = [
            f"啟動時間: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"sys.executable: {sys.executable}",
            f"sys.frozen: {getattr(sys, 'frozen', False)}",
            f"base_path: {base_path}",
            f"www_dir: {www_dir}",
            f"index.html 啟動前是否存在: {index_existed_before_setup}",
            f"port: {port}",
        ]
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        pass

# ---------------------------
# 主程式進入點
# ---------------------------
def main():
    port = 8000
    base_path = get_base_path()
    www_dir = os.path.join(base_path, "www")
    index_html_path = os.path.join(www_dir, "index.html")
    # 在自動建立資料夾之前先記錄原始狀態，才能正確判斷是否為「內容遺失」
    index_existed_before_setup = os.path.isfile(index_html_path)

    if not os.path.exists(www_dir):
        os.makedirs(www_dir)
    upload_dir = os.path.join(www_dir, "upload")
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
    html_dir = os.path.join(www_dir, "html")
    if not os.path.exists(html_dir):
        os.makedirs(html_dir)

    _write_startup_log(base_path, www_dir, index_existed_before_setup, port)

    app = QApplication(sys.argv)

    # 設置全域應用程式圖示
    icon_path = ensure_app_icon()
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))

    # 封裝為執行檔時，若同路徑下的 www/index.html 遺失，明確提示使用者，
    # 避免只看到空白網頁而不知道原因
    if getattr(sys, "frozen", False) and not index_existed_before_setup:
        QMessageBox.critical(
            None, "找不到網頁內容",
            "程式在下列路徑找不到 index.html：\n\n"
            f"{index_html_path}\n\n"
            "請確認「www」資料夾與本執行檔（.exe）放在同一個資料夾內，\n"
            "且資料夾內容沒有被移動、改名或刪除，然後重新開啟本程式。"
        )

    server_thread = HTTPServerThread(port)
    window = MainWindow(server_thread, port)
    server_thread.start()
    window.show()

    exit_code = app.exec_()
    server_thread.stop()
    server_thread.wait()
    sys.exit(exit_code)

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        _early_log(f"CRASH in main(): {traceback.format_exc()}")
        try:
            from PyQt5.QtWidgets import QApplication, QMessageBox
            app = QApplication.instance() or QApplication(sys.argv)
            QMessageBox.critical(None, "程式啟動失敗", f"發生嚴重錯誤：\n\n{traceback.format_exc()}")
        except Exception:
            pass
