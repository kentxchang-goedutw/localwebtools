// -----------------------------
// 設定圖示與密碼輸入遮罩事件
document.getElementById("settingsIcon").addEventListener("click", function() {
  document.getElementById("passwordOverlay").style.display = "flex";
  document.getElementById("passwordInput").value = "";
  document.getElementById("passwordInput").focus();
});

document.getElementById("passwordSubmit").addEventListener("click", function() {
  var pwd = document.getElementById("passwordInput").value;
  if (pwd === "tpet") {
    showHiddenFiles = true;
    
    // 顯示右上角教師管理按鈕
    var adminWrapper = document.getElementById("teacherAdminWrapper");
    if (adminWrapper) {
      adminWrapper.style.display = "block";
    }

    loadDirectory(currentPath);
    document.getElementById("passwordOverlay").style.display = "none";
  } else {
    alert("密碼錯誤，請重新輸入！");
  }
});

document.getElementById("passwordInput").addEventListener("keypress", function(e) {
  if (e.key === "Enter") {
    document.getElementById("passwordSubmit").click();
  }
});
