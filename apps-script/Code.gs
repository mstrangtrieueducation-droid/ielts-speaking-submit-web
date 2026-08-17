const MASTER_SPREADSHEET_ID = "1E3TP7nRQi40_V8GFGPNSZwoudmS00h8EYg6EUPbaxKQ";
const SUBMISSION_ROOT_FOLDER_ID = "1APpV6RdcUqhmAYik5J59ESSgTyRoNSMp";
const LEGACY_AUTO_SPREADSHEET_ID = "1uCFwvYNm3qge8Q1nikvFLhjT-QMO5z47NQHwQDKeXlU";

const S01_RESULT_SHEET_NAME = "IELTS SPEAKING - S01";
const TOPIC_RESULT_SHEET_NAME = "IELTS SPEAKING - CÁC TOPIC";
const SYSTEM_LOG_SHEET_NAME = "IELTS SPEAKING - NHẬT KÝ HỆ THỐNG";

const MAX_COMBINED_BYTES = 25 * 1024 * 1024;
const LOG_HEADERS = [
  "Thời gian bắt đầu",
  "Mã bài",
  "Họ và tên",
  "Email",
  "Lớp",
  "Trạng thái",
  "Mã lượt",
  "Hàng kết quả",
  "Ghi chú",
  "Cập nhật cuối",
];
const RESULT_HEADERS = [
  "Dấu thời gian",
  "Họ và tên đầy đủ",
  "Lớp",
  "Mã bài",
  "File ghi âm",
  "Nguồn/Xác nhận",
  "Email",
  "Trạng thái",
  "File PDF",
  "Ghi âm Phần 1",
  "Ghi âm Phần 2",
  "Mã lượt",
];

// S01 is the two-recording notebook assignment. The remaining 31 active
// assignments are one-recording topic submissions. Codes intentionally absent
// from this map are never allowed to create rows, folders, or files.
const ASSIGNMENTS = Object.freeze({
  S01: assignment_("S01", "Giới thiệu tổng quan về IELTS SPEAKING PART 1", S01_RESULT_SHEET_NAME, "S01"),
  S02: assignment_("S02", "Student Life & Study", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S03: assignment_("S03", "Neighbours & Houses", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S04: assignment_("S04", "Books & Sports", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S05: assignment_("S05", "Art & Photography", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S06: assignment_("S06", "Music & Films", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S07: assignment_("S07", "Friends & Teamwork", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S10: assignment_("S10", "Relaxing & Holidays", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S11: assignment_("S11", "Internet & Social Media", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S12: assignment_("S12", "Learning & Sharing", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S13: assignment_("S13", "Weekends & Weather", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S14: assignment_("S14", "Roads & Transportation", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S15: assignment_("S15", "Being Alone & Everyday Items", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S16: assignment_("S16", "Teachers & Advice", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S19: assignment_("S19", "Speaking PART II Introduction", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S20: assignment_("S20", "Speaking PART III Introduction", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S21: assignment_("S21", "Photography & Interesting Places", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S22: assignment_("S22", "Attractive Locations & Opinions", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S23: assignment_("S23", "Interesting Job & Science Subjects", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S24: assignment_("S24", "Role Models & Good Friends", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S25: assignment_("S25", "Achievements & Foreign Countries", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S26: assignment_("S26", "Films & Historical Periods", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S27: assignment_("S27", "Computer Problems & Important Rules", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S28: assignment_("S28", "Learning Skills & Important Plants", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S31: assignment_("S31", "Disliking Others & Long Journeys", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S32: assignment_("S32", "Culture & Peaceful Places", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S33: assignment_("S33", "Special Days & Family Members", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S34: assignment_("S34", "Competitions & Crowded Places", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S35: assignment_("S35", "Children & Interesting People", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S36: assignment_("S36", "Cooking & Service", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S37: assignment_("S37", "Difficult Tasks & Teaching Others", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
  S38: assignment_("S38", "Intelligence & Adventures", TOPIC_RESULT_SHEET_NAME, "TOPIC"),
});

const RESERVED_CODES = Object.freeze({
  S08: true,
  S09: true,
  S17: true,
  S18: true,
  S29: true,
  S30: true,
  S39: true,
  S40: true,
});

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
    return bridge_(body.requestId, {
      ok: false,
      code: "SERVER_ERROR",
      error: String(error && error.message ? error.message : error),
    });
  }
}

function startAttempt_(body) {
  const assignmentCode = normalizeAssignmentCode_(body.assignmentCode);
  const assignmentCheck = validateAssignmentCode_(assignmentCode);
  if (!assignmentCheck.ok) return assignmentCheck;

  const assignment = assignmentCheck.assignment;
  const studentName = clean_(body.studentName);
  const email = clean_(body.email).toLowerCase();
  const className = clean_(body.className);
  if (!studentName || !email || !className) {
    return { ok: false, code: "MISSING_INFO", error: "Em cần điền đủ họ tên, email và lớp." };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const logSheet = getSystemLogSheet_();
    const values = logSheet.getDataRange().getValues();
    const matches = [];
    for (let i = 1; i < values.length; i += 1) {
      const sameAttempt = normalizeAssignmentCode_(values[i][1]) === assignment.code
        && clean_(values[i][3]).toLowerCase() === email;
      if (sameAttempt) matches.push({ row: i + 1, values: values[i] });
    }

    const submitted = matches.find(function (item) {
      return clean_(item.values[5]).toUpperCase() === "SUBMITTED";
    });
    if (submitted) return duplicateAttempt_(assignment.code);

    const active = matches.slice().reverse().find(function (item) {
      return isRecoverableRecordingStatus_(item.values[5]);
    });
    if (active) {
      const token = clean_(active.values[6]);
      logSheet.getRange(active.row, 6, 1, 5).setValues([[
        "RECORDING_V3",
        token,
        active.values[7] || "",
        active.values[8] || "",
        new Date(),
      ]]);
      return {
        ok: true,
        token: token,
        recovered: true,
        assignmentCode: assignment.code,
        assignmentTitle: assignment.title,
        submissionMode: assignment.mode,
      };
    }

    // A teacher must explicitly reset any other existing status. Students can
    // never obtain a second attempt simply by refreshing or changing devices.
    if (matches.length) return duplicateAttempt_(assignment.code);

    const token = Utilities.getUuid();
    const now = new Date();
    logSheet.appendRow([
      now,
      assignment.code,
      studentName,
      email,
      className,
      "RECORDING_V3",
      token,
      "",
      JSON.stringify({ version: 4, source: "speaking-web" }),
      now,
    ]);
    return {
      ok: true,
      token: token,
      assignmentCode: assignment.code,
      assignmentTitle: assignment.title,
      submissionMode: assignment.mode,
    };
  } finally {
    lock.releaseLock();
  }
}

function submitAttempt_(body) {
  const token = clean_(body.token);
  if (!token) {
    return { ok: false, code: "MISSING_TOKEN", error: "Không tìm thấy mã lượt ghi âm này." };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const logSheet = getSystemLogSheet_();
    const logEntry = findLogEntryByToken_(logSheet, token);
    if (!logEntry) {
      return { ok: false, code: "INVALID_TOKEN", error: "Không tìm thấy lượt ghi âm này." };
    }

    const status = clean_(logEntry.values[5]).toUpperCase();
    if (status === "SUBMITTED") {
      return { ok: false, code: "DUPLICATE", error: "Bài này đã được nộp; em không cần nộp lại." };
    }
    if (!isRecoverableRecordingStatus_(status)) {
      return { ok: false, code: "INVALID_STATE", error: "Lượt ghi âm này chưa ở trạng thái có thể nộp. Em hãy báo cô Trang." };
    }

    const assignmentCode = normalizeAssignmentCode_(logEntry.values[1]);
    const assignmentCheck = validateAssignmentCode_(assignmentCode);
    if (!assignmentCheck.ok) return assignmentCheck;
    const assignment = assignmentCheck.assignment;
    const filePayload = validateAndDecodeFiles_(assignment, body);
    if (!filePayload.ok) return filePayload;

    const totalBytes = (filePayload.notebookBytes ? filePayload.notebookBytes.length : 0)
      + (filePayload.audioPart1Bytes ? filePayload.audioPart1Bytes.length : 0)
      + (filePayload.audioPart2Bytes ? filePayload.audioPart2Bytes.length : 0)
      + (filePayload.singleAudioBytes ? filePayload.singleAudioBytes.length : 0);
    if (totalBytes > MAX_COMBINED_BYTES) {
      return {
        ok: false,
        code: "TOO_LARGE",
        error: assignment.mode === "S01"
          ? "Tổng dung lượng PDF và các phần ghi âm vượt 25 MB. Em hãy giảm dung lượng ảnh rồi thử lại."
          : "File ghi âm vượt 25 MB. Em hãy giảm dung lượng rồi thử lại.",
      };
    }

    const studentName = clean_(logEntry.values[2]);
    const email = clean_(logEntry.values[3]).toLowerCase();
    const className = clean_(logEntry.values[4]);
    const safeBase = safeName_(assignment.code + " - " + studentName);
    const folder = getAssignmentFolder_(assignment.code);
    const createdFiles = [];
    let resultWrite = null;

    try {
      const saved = saveSubmissionFiles_(folder, safeBase, assignment, body, filePayload);
      [saved.notebook, saved.audioPart1, saved.audioPart2, saved.singleAudio].forEach(function (file) {
        if (file) createdFiles.push(file);
      });

      resultWrite = upsertHumanResult_({
        assignment: assignment,
        studentName: studentName,
        email: email,
        className: className,
        token: token,
        notebookUrl: fileUrl_(saved.notebook),
        audioPart1Url: fileUrl_(saved.audioPart1),
        audioPart2Url: fileUrl_(saved.audioPart2),
        singleAudioUrl: fileUrl_(saved.singleAudio),
      });

      const note = {
        version: 4,
        source: "speaking-web",
        resultSheet: assignment.resultSheet,
        folderId: folder.getId(),
        notebookName: fileName_(saved.notebook),
        notebookUrl: fileUrl_(saved.notebook),
        audioPart1Name: fileName_(saved.audioPart1),
        audioPart1Url: fileUrl_(saved.audioPart1),
        audioPart2Name: fileName_(saved.audioPart2),
        audioPart2Url: fileUrl_(saved.audioPart2),
        singleAudioName: fileName_(saved.singleAudio),
        singleAudioUrl: fileUrl_(saved.singleAudio),
      };
      logSheet.getRange(logEntry.row, 6, 1, 5).setValues([[
        "SUBMITTED",
        token,
        resultWrite.row,
        JSON.stringify(note),
        new Date(),
      ]]);

      return {
        ok: true,
        assignmentCode: assignment.code,
        notebookUrl: note.notebookUrl,
        audioPart1Url: note.audioPart1Url || note.singleAudioUrl,
        audioPart2Url: note.audioPart2Url,
        audioUrl: note.singleAudioUrl,
      };
    } catch (error) {
      if (resultWrite) rollbackHumanResult_(resultWrite.sheet, resultWrite.row, token);
      createdFiles.forEach(function (file) {
        try { file.setTrashed(true); } catch (cleanupError) {}
      });
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

function validateAndDecodeFiles_(assignment, body) {
  const notebookBase64 = clean_(body.notebookBase64);
  const legacyAudioBase64 = clean_(body.audioBase64);
  const modernPart1Base64 = clean_(body.audioPart1Base64);
  const audioPart2Base64 = clean_(body.audioPart2Base64);

  if (assignment.mode === "S01") {
    const audioPart1Base64 = modernPart1Base64 || legacyAudioBase64;
    // Old S01 pages submitted one combined `audioBase64`. Keep that exact
    // payload working, while current S01 submissions provide two modern parts.
    const legacySingleRecording = Boolean(legacyAudioBase64) && !modernPart1Base64 && !audioPart2Base64;
    if (!notebookBase64 || !audioPart1Base64 || (!legacySingleRecording && !audioPart2Base64)) {
      return { ok: false, code: "MISSING_FILES", error: "Bài S01 chưa đủ PDF và hai phần ghi âm." };
    }
    return {
      ok: true,
      legacySingleRecording: legacySingleRecording,
      notebookBytes: Utilities.base64Decode(notebookBase64),
      audioPart1Bytes: Utilities.base64Decode(audioPart1Base64),
      audioPart2Bytes: audioPart2Base64 ? Utilities.base64Decode(audioPart2Base64) : [],
      singleAudioBytes: [],
    };
  }

  const suppliedAudioFields = [legacyAudioBase64, modernPart1Base64, audioPart2Base64].filter(Boolean);
  if (notebookBase64) {
    return { ok: false, code: "UNEXPECTED_PDF", error: "Mã bài này chỉ nhận 01 file ghi âm; không cần nộp PDF." };
  }
  if (suppliedAudioFields.length !== 1 || audioPart2Base64) {
    return { ok: false, code: "INVALID_FILE_COUNT", error: "Mã bài này cần đúng 01 file ghi âm." };
  }
  const singleAudioBase64 = legacyAudioBase64 || modernPart1Base64;
  return {
    ok: true,
    legacySingleRecording: false,
    notebookBytes: [],
    audioPart1Bytes: [],
    audioPart2Bytes: [],
    singleAudioBytes: Utilities.base64Decode(singleAudioBase64),
  };
}

function saveSubmissionFiles_(folder, safeBase, assignment, body, payload) {
  const saved = { notebook: null, audioPart1: null, audioPart2: null, singleAudio: null };
  if (assignment.mode === "S01") {
    saved.notebook = folder.createFile(Utilities.newBlob(
      payload.notebookBytes,
      body.notebookType || "application/pdf",
      safeBase + " - VỞ CHÉP.pdf"
    ));
    const part1Type = body.audioPart1Type || body.audioType || "audio/webm";
    saved.audioPart1 = folder.createFile(Utilities.newBlob(
      payload.audioPart1Bytes,
      part1Type,
      safeBase + (payload.legacySingleRecording ? " - BÀI GHI ÂM." : " - PHẦN 1 - LUYỆN ÂM.") + audioExtension_(part1Type)
    ));
    if (payload.audioPart2Bytes.length) {
      const part2Type = body.audioPart2Type || "audio/webm";
      saved.audioPart2 = folder.createFile(Utilities.newBlob(
        payload.audioPart2Bytes,
        part2Type,
        safeBase + " - PHẦN 2 - SPEAKING PART 1." + audioExtension_(part2Type)
      ));
    }
    return saved;
  }

  const singleAudioType = clean_(body.audioBase64)
    ? (body.audioType || "audio/webm")
    : (body.audioPart1Type || body.audioType || "audio/webm");
  saved.singleAudio = folder.createFile(Utilities.newBlob(
    payload.singleAudioBytes,
    singleAudioType,
    safeBase + " - BÀI GHI ÂM." + audioExtension_(singleAudioType)
  ));
  return saved;
}

function upsertHumanResult_(submission) {
  const sheet = getPreparedResultSheet_(submission.assignment.resultSheet);
  const existingRow = findTokenRow_(sheet, submission.token, 12);
  const row = existingRow > 0 ? existingRow : sheet.getLastRow() + 1;
  const mainAudioUrl = submission.assignment.mode === "S01"
    ? (submission.audioPart2Url || submission.audioPart1Url)
    : submission.singleAudioUrl;
  sheet.getRange(row, 1, 1, RESULT_HEADERS.length).setValues([[
    new Date(),
    submission.studentName,
    submission.className,
    submission.assignment.label,
    mainAudioUrl,
    "Web nộp bài tự động",
    submission.email,
    "SUBMITTED",
    submission.assignment.mode === "S01" ? submission.notebookUrl : "",
    submission.assignment.mode === "S01" ? submission.audioPart1Url : "",
    submission.assignment.mode === "S01" ? submission.audioPart2Url : "",
    submission.token,
  ]]);
  return { sheet: sheet, row: row };
}

function rollbackHumanResult_(sheet, row, token) {
  try {
    if (clean_(sheet.getRange(row, 12).getValue()) === token) {
      sheet.getRange(row, 1, 1, RESULT_HEADERS.length).clearContent();
    }
  } catch (cleanupError) {}
}

function getPreparedResultSheet_(sheetName) {
  const spreadsheet = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Không tìm thấy tab kết quả: " + sheetName);
  ensureColumnCount_(sheet, RESULT_HEADERS.length);
  sheet.getRange(1, 1, 1, RESULT_HEADERS.length).setValues([RESULT_HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getSystemLogSheet_() {
  const spreadsheet = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SYSTEM_LOG_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SYSTEM_LOG_SHEET_NAME);
  ensureColumnCount_(sheet, LOG_HEADERS.length);
  sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  sheet.setFrozenRows(1);
  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function getAssignmentFolder_(assignmentCode) {
  const propertyKey = "SPEAKING_SUBMISSION_FOLDER_" + assignmentCode;
  const properties = PropertiesService.getScriptProperties();
  const cachedId = properties.getProperty(propertyKey);
  if (cachedId) {
    try { return DriveApp.getFolderById(cachedId); } catch (error) {}
  }

  const root = DriveApp.getFolderById(SUBMISSION_ROOT_FOLDER_ID);
  const existing = root.getFoldersByName(assignmentCode);
  const folder = existing.hasNext() ? existing.next() : root.createFolder(assignmentCode);
  properties.setProperty(propertyKey, folder.getId());
  return folder;
}

function findLogEntryByToken_(sheet, token) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const tokens = sheet.getRange(2, 7, lastRow - 1, 1).getValues();
  for (let i = 0; i < tokens.length; i += 1) {
    if (clean_(tokens[i][0]) === token) {
      const row = i + 2;
      return { row: row, values: sheet.getRange(row, 1, 1, LOG_HEADERS.length).getValues()[0] };
    }
  }
  return null;
}

function findTokenRow_(sheet, token, tokenColumn) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, tokenColumn, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (clean_(values[i][0]) === token) return i + 2;
  }
  return -1;
}

function validateAssignmentCode_(assignmentCode) {
  if (RESERVED_CODES[assignmentCode]) {
    return { ok: false, code: "RESERVED_CODE", error: "Mã bài " + assignmentCode + " chưa được sử dụng." };
  }
  const assignment = ASSIGNMENTS[assignmentCode];
  if (!assignment) {
    return { ok: false, code: "INVALID_CODE", error: "Mã bài không hợp lệ. Em hãy mở lại đúng link cô Trang đã gửi." };
  }
  return { ok: true, assignment: assignment };
}

function assignment_(code, title, resultSheet, mode) {
  return {
    code: code,
    title: title,
    label: title ? code + " | " + title : code,
    resultSheet: resultSheet,
    mode: mode,
  };
}

function duplicateAttempt_(assignmentCode) {
  return {
    ok: false,
    code: "DUPLICATE",
    error: "Email này đã bắt đầu hoặc đã nộp mã bài " + assignmentCode + ". Mỗi học sinh chỉ có 01 lượt.",
  };
}

function isRecoverableRecordingStatus_(status) {
  const value = clean_(status).toUpperCase();
  return value === "STARTED" || value.indexOf("RECORDING") === 0;
}

function ensureColumnCount_(sheet, count) {
  const missing = count - sheet.getMaxColumns();
  if (missing > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), missing);
}

function normalizeAssignmentCode_(value) {
  return clean_(value).toUpperCase();
}

function fileName_(file) {
  return file ? file.getName() : "";
}

function fileUrl_(file) {
  return file ? file.getUrl() : "";
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
  const message = JSON.stringify({
    source: "ielts-speaking-drive",
    requestId: clean_(requestId),
    result: result,
  }).replace(/</g, "\\u003c");
  return HtmlService.createHtmlOutput(
    "<!doctype html><meta charset='utf-8'><script>window.top.postMessage(" + message + ", '*');</" + "script>"
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * One-time, manual migration helper. It is intentionally never called by
 * doGet/doPost. Run it once from the Apps Script editor before deploying the
 * new backend, then inspect the returned summary and the hidden log tab.
 * Re-running it is safe because rows are deduplicated by Mã lượt (token).
 */
function migrateLegacyAutoSheetToSystemLog() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const legacySpreadsheet = SpreadsheetApp.openById(LEGACY_AUTO_SPREADSHEET_ID);
    const legacySheet = legacySpreadsheet.getSheets()[0];
    const values = legacySheet.getDataRange().getValues();
    const logSheet = getSystemLogSheet_();
    const existingTokens = {};
    const currentLastRow = logSheet.getLastRow();
    if (currentLastRow >= 2) {
      logSheet.getRange(2, 7, currentLastRow - 1, 1).getValues().forEach(function (row) {
        const token = clean_(row[0]);
        if (token) existingTokens[token] = true;
      });
    }

    let migrated = 0;
    let skipped = 0;
    for (let i = 1; i < values.length; i += 1) {
      const legacyRow = values[i];
      const token = clean_(legacyRow[6]);
      if (!token || existingTokens[token]) {
        skipped += 1;
        continue;
      }
      const note = {
        migratedFrom: LEGACY_AUTO_SPREADSHEET_ID,
        legacyRow: i + 1,
        notebookName: clean_(legacyRow[7]),
        notebookUrl: clean_(legacyRow[8]),
        audioPart1Name: clean_(legacyRow[9]),
        audioPart1Url: clean_(legacyRow[10]),
        audioPart2Name: clean_(legacyRow[11]),
        audioPart2Url: clean_(legacyRow[12]),
      };
      const startedAt = legacyRow[0] || new Date();
      logSheet.appendRow([
        startedAt,
        normalizeAssignmentCode_(legacyRow[1]),
        clean_(legacyRow[2]),
        clean_(legacyRow[3]).toLowerCase(),
        clean_(legacyRow[4]),
        clean_(legacyRow[5]) || "RECORDING_V3",
        token,
        "",
        JSON.stringify(note),
        new Date(),
      ]);
      existingTokens[token] = true;
      migrated += 1;
    }
    return { ok: true, migrated: migrated, skipped: skipped, legacyRows: Math.max(0, values.length - 1) };
  } finally {
    lock.releaseLock();
  }
}
