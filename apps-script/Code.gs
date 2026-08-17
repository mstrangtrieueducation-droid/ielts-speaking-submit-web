const PARENT_FOLDER_ID = "1I3Uzhu2pBNVL98992tifBZ9AZkrLUQDJ";
const SUBMISSION_FOLDER_NAME = "NỘP BÀI SPEAKING - TỰ ĐỘNG";
const RESULT_SHEET_NAME = "KẾT QUẢ NỘP BÀI SPEAKING - TỰ ĐỘNG";
const MAX_COMBINED_BYTES = 25 * 1024 * 1024;

function doGet() {
  return json_({ ok: true, service: "IELTS Speaking submission service" });
}

function doPost(e) {
  let body = {};
  try {
    const raw = (e && e.parameter && e.parameter.payload) || (e && e.postData && e.postData.contents) || "{}";
    body = JSON.parse(raw);
    if (body.action === "start") return bridge_(body.requestId, startAttempt_(body));
    if (body.action === "submit") return bridge_(body.requestId, submitAttempt_(body));
    return bridge_(body.requestId, { ok: false, code: "BAD_ACTION", error: "Yêu cầu không hợp lệ." });
  } catch (error) {
    return bridge_(body.requestId, { ok: false, code: "SERVER_ERROR", error: String(error && error.message ? error.message : error) });
  }
}

function startAttempt_(body) {
  const assignmentCode = clean_(body.assignmentCode).toUpperCase();
  const studentName = clean_(body.studentName);
  const email = clean_(body.email).toLowerCase();
  const className = clean_(body.className);
  if (!assignmentCode || !studentName || !email || !className) {
    return { ok: false, code: "MISSING_INFO", error: "Em cần điền đủ họ tên, email và lớp." };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getResultSheet_();
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i += 1) {
      const sameAttempt = clean_(values[i][1]).toUpperCase() === assignmentCode && clean_(values[i][3]).toLowerCase() === email;
      if (!sameAttempt) continue;
      const status = clean_(values[i][5]).toUpperCase();
      // The first recorder deployment could save STARTED but lose its iframe
      // response. Recover exactly that orphaned row instead of charging the
      // student a second attempt. Submitted/active attempts stay locked.
      if (status === "STARTED") {
        const existingToken = clean_(values[i][6]);
        sheet.getRange(i + 1, 6).setValue("RECORDING");
        return { ok: true, token: existingToken, recovered: true };
      }
      return { ok: false, code: "DUPLICATE", error: "Email này đã bắt đầu hoặc đã nộp mã bài " + assignmentCode + ". Mỗi học sinh chỉ có 01 lượt." };
    }
    const token = Utilities.getUuid();
    sheet.appendRow([new Date(), assignmentCode, studentName, email, className, "RECORDING", token, "", "", "", ""]);
    return { ok: true, token: token };
  } finally {
    lock.releaseLock();
  }
}

function submitAttempt_(body) {
  const token = clean_(body.token);
  const notebookBase64 = clean_(body.notebookBase64);
  const audioBase64 = clean_(body.audioBase64);
  if (!token || !notebookBase64 || !audioBase64) {
    return { ok: false, code: "MISSING_FILES", error: "Bài nộp chưa đủ PDF và file ghi âm." };
  }

  const notebookBytes = Utilities.base64Decode(notebookBase64);
  const audioBytes = Utilities.base64Decode(audioBase64);
  if (notebookBytes.length + audioBytes.length > MAX_COMBINED_BYTES) {
    return { ok: false, code: "TOO_LARGE", error: "Tổng dung lượng PDF và ghi âm vượt 25 MB. Em hãy giảm dung lượng ảnh rồi thử lại." };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getResultSheet_();
    const values = sheet.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < values.length; i += 1) {
      if (clean_(values[i][6]) === token) { targetRow = i + 1; break; }
    }
    if (targetRow < 0) return { ok: false, code: "INVALID_TOKEN", error: "Không tìm thấy lượt ghi âm này." };
    if (clean_(sheet.getRange(targetRow, 6).getValue()) === "SUBMITTED") {
      return { ok: false, code: "DUPLICATE", error: "Bài này đã được nộp; em không cần nộp lại." };
    }

    const assignmentCode = clean_(sheet.getRange(targetRow, 2).getValue());
    const studentName = clean_(sheet.getRange(targetRow, 3).getValue());
    const safeBase = safeName_(assignmentCode + " - " + studentName);
    const folder = getSubmissionFolder_();
    const notebook = folder.createFile(Utilities.newBlob(notebookBytes, body.notebookType || "application/pdf", safeBase + " - VỞ CHÉP.pdf"));
    const audioExt = audioExtension_(body.audioType);
    const audio = folder.createFile(Utilities.newBlob(audioBytes, body.audioType || "audio/webm", safeBase + " - BÀI GHI ÂM." + audioExt));

    sheet.getRange(targetRow, 1).setValue(new Date());
    sheet.getRange(targetRow, 6).setValue("SUBMITTED");
    sheet.getRange(targetRow, 8, 1, 4).setValues([[notebook.getName(), notebook.getUrl(), audio.getName(), audio.getUrl()]]);
    return { ok: true, notebookUrl: notebook.getUrl(), audioUrl: audio.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

function getSubmissionFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty("SUBMISSION_FOLDER_ID");
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (error) {}
  }
  const parent = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const existing = parent.getFoldersByName(SUBMISSION_FOLDER_NAME);
  const folder = existing.hasNext() ? existing.next() : parent.createFolder(SUBMISSION_FOLDER_NAME);
  props.setProperty("SUBMISSION_FOLDER_ID", folder.getId());
  return folder;
}

function getResultSheet_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty("RESULT_SHEET_ID");
  let spreadsheet;
  if (cached) {
    try { spreadsheet = SpreadsheetApp.openById(cached); } catch (error) {}
  }
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create(RESULT_SHEET_NAME);
    const file = DriveApp.getFileById(spreadsheet.getId());
    file.moveTo(getSubmissionFolder_());
    props.setProperty("RESULT_SHEET_ID", spreadsheet.getId());
  }
  const sheet = spreadsheet.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Thời gian", "Mã bài", "Họ và tên", "Email", "Lớp", "Trạng thái", "Mã lượt", "Tên PDF", "Link PDF", "Tên ghi âm", "Link ghi âm"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function audioExtension_(mime) {
  const value = clean_(mime).toLowerCase();
  if (value.indexOf("mp4") >= 0) return "m4a";
  if (value.indexOf("ogg") >= 0) return "ogg";
  return "webm";
}

function safeName_(value) {
  return clean_(value).replace(/[\\/:*?"<>|#%{}]/g, "-").substring(0, 140);
}

function clean_(value) {
  return String(value == null ? "" : value).trim();
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function bridge_(requestId, result) {
  const message = JSON.stringify({ source: "ielts-speaking-drive", requestId: clean_(requestId), result: result }).replace(/</g, "\\u003c");
  // Apps Script wraps user HTML in its own sandboxed iframe. `top` reaches the
  // original recorder page; `parent` only reaches Google's wrapper and leaves
  // the student waiting forever.
  return HtmlService.createHtmlOutput("<!doctype html><meta charset='utf-8'><script>window.top.postMessage(" + message + ", '*');</" + "script>")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
