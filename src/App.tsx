"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

type ImageItem = { id: string; file: File; preview: string; rotation: number };
type RecorderState = "idle" | "recording" | "paused" | "finished" | "submitted";

const ASSIGNMENT_CODE = "S01";
const API_BASE = (import.meta.env.VITE_APPS_SCRIPT_URL || "").trim();
const LOGO_URL = `${import.meta.env.BASE_URL}logo.webp`;
const classes = Array.from({ length: 14 }, (_, index) => `IELTS ${index + 40}`);

type ApiResult = {
  ok: boolean;
  token?: string;
  error?: string;
  notebookUrl?: string;
  audioUrl?: string;
};

async function postToDrive(payload: Record<string, unknown>) {
  if (!API_BASE) throw new Error("Cổng nhận bài chưa được cấu hình. Em hãy báo cô Trang.");
  const requestId = crypto.randomUUID();
  return await new Promise<ApiResult>((resolve, reject) => {
    const frameName = `drive-bridge-${requestId}`;
    const frame = document.createElement("iframe");
    frame.name = frameName;
    frame.title = "Kết nối Google Drive";
    frame.hidden = true;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = API_BASE;
    form.target = frameName;
    form.acceptCharset = "UTF-8";
    form.hidden = true;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify({ ...payload, requestId });
    form.appendChild(input);

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
      frame.remove();
      form.remove();
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; requestId?: string; result?: ApiResult };
      if (data?.source !== "ielts-speaking-drive" || data.requestId !== requestId || !data.result) return;
      cleanup();
      if (!data.result.ok) reject(new Error(data.result.error || "Chưa gửi được dữ liệu lên Google Drive."));
      else resolve(data.result);
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Drive phản hồi quá chậm. Em hãy giữ nguyên trang và thử gửi lại."));
    }, 180000);

    window.addEventListener("message", onMessage);
    document.body.append(frame, form);
    form.submit();
  });
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Không đọc được tệp để gửi lên Google Drive."));
    reader.readAsDataURL(blob);
  });
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function preferredAudioType() {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh.")); };
    image.src = url;
  });
}

async function normalizeImage(file: File, rotation: number) {
  let source: Blob = file;
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    const module = await import("heic2any");
    const converted = await module.default({ blob: file, toType: "image/jpeg", quality: 0.92 });
    source = Array.isArray(converted) ? converted[0] : converted;
  }
  const image = await loadImage(source);
  const quarterTurn = Math.abs(rotation % 180) === 90;
  const canvas = document.createElement("canvas");
  canvas.width = quarterTurn ? image.height : image.width;
  canvas.height = quarterTurn ? image.width : image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể xử lý ảnh trên thiết bị này.");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không thể tạo ảnh PDF.")), "image/jpeg", 0.9));
}

async function imagesToPdf(items: ImageItem[]) {
  const document = await PDFDocument.create();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 22;
  for (const item of items) {
    const blob = await normalizeImage(item.file, item.rotation);
    const embedded = await document.embedJpg(await blob.arrayBuffer());
    const scale = Math.min((pageWidth - margin * 2) / embedded.width, (pageHeight - margin * 2) / embedded.height);
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    const page = document.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
  }
  const bytes = await document.save();
  const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([pdfBuffer], `${ASSIGNMENT_CODE}-vo-chep.pdf`, { type: "application/pdf" });
}

export default function RecorderStudio() {
  const [studentName, setStudentName] = useState("");
  const [email, setEmail] = useState("");
  const [className, setClassName] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [micTested, setMicTested] = useState(false);
  const [micSampleUrl, setMicSampleUrl] = useState("");
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [part, setPart] = useState<1 | 2>(1);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const identityCardRef = useRef<HTMLElement | null>(null);
  const studentNameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const classSelectRef = useRef<HTMLSelectElement | null>(null);
  const isEmbedded = window.self !== window.top;

  useEffect(() => {
    const protectOfficialAttempt = (event: BeforeUnloadEvent) => {
      if (!(["recording", "paused", "finished"] as RecorderState[]).includes(recorderState) && !submitting) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectOfficialAttempt);
    return () => window.removeEventListener("beforeunload", protectOfficialAttempt);
  }, [recorderState, submitting]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const hasNotebook = images.length > 0 || Boolean(pdfFile);
  const identityReady = studentName.trim().length >= 3 && /^\S+@\S+\.\S+$/.test(email.trim()) && Boolean(className);
  const readyToStart = identityReady && acknowledged && micTested && recorderState === "idle";
  const canSubmit = recorderState === "finished" && Boolean(audioBlob) && hasNotebook && !submitting;
  const missingStartSteps = [
    studentName.trim().length < 3 ? "họ và tên" : "",
    !/^\S+@\S+\.\S+$/.test(email.trim()) ? "email hợp lệ" : "",
    !className ? "lớp" : "",
    !micTested ? "thử micro" : "",
    !acknowledged ? "tích xác nhận đã luyện kỹ" : "",
  ].filter(Boolean);

  const statusText = useMemo(() => ({ idle: "CHƯA BẮT ĐẦU", recording: "ĐANG GHI", paused: "ĐANG DỪNG TẠM", finished: "ĐÃ GHI XONG", submitted: "ĐÃ NỘP BÀI" }[recorderState]), [recorderState]);

  function openStandaloneRecorder() {
    const target = new URL(window.location.href);
    target.searchParams.set("standalone", "1");
    const opened = window.open(target.toString(), "_blank", "noopener,noreferrer");
    if (!opened) setError("Trình duyệt đang chặn cửa sổ mới. Em hãy cho phép cửa sổ bật lên rồi bấm lại.");
  }

  function chooseFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploadError("");
    const chosen = Array.from(files);
    const pdfs = chosen.filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    if (pdfs.length) {
      if (chosen.length !== 1) { setUploadError("Nếu nộp PDF, em chỉ chọn đúng 01 file PDF; không chọn chung với ảnh."); return; }
      images.forEach((item) => URL.revokeObjectURL(item.preview));
      setImages([]);
      setPdfFile(pdfs[0]);
      return;
    }
    if (!chosen.every((file) => file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name))) {
      setUploadError("Chỉ chấp nhận ảnh JPG, PNG, WEBP, HEIC/HEIF hoặc 01 file PDF.");
      return;
    }
    setPdfFile(null);
    setImages((current) => [...current, ...chosen.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), rotation: 0 }))]);
  }

  function moveImage(id: string, direction: -1 | 1) {
    setImages((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  function dropImage(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setImages((current) => {
      const from = current.findIndex((item) => item.id === draggedId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const copy = [...current];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
    setDraggedId(null);
  }

  function rotateImage(id: string) {
    setImages((current) => current.map((item) => item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item));
  }

  function removeImage(id: string) {
    setImages((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  async function startMicTest() {
    setError("");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Thiết bị hoặc trình duyệt này chưa hỗ trợ ghi âm an toàn. Em hãy mở trang bằng Chrome, Edge hoặc Safari bản mới nhất.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const recorder = new MediaRecorder(stream, preferredAudioType() ? { mimeType: preferredAudioType() } : undefined);
      const sample: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) sample.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(sample, { type: recorder.mimeType || "audio/webm" });
        if (micSampleUrl) URL.revokeObjectURL(micSampleUrl);
        setMicSampleUrl(URL.createObjectURL(blob));
        setMicTested(true);
        setMicTesting(false);
      };
      recorderRef.current = recorder;
      recorder.start(400);
      setMicTesting(true);
    } catch (cause) {
      setMicTesting(false);
      setError(cause instanceof Error && cause.message.includes("chưa hỗ trợ")
        ? cause.message
        : "Không mở được micro. Em hãy cho phép trang web sử dụng micro rồi thử lại.");
    }
  }

  function stopMicTest() {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
  }

  async function handleOfficialStartClick() {
    const currentName = (studentNameInputRef.current?.value || studentName).trim();
    const currentEmail = (emailInputRef.current?.value || email).trim().toLowerCase();
    const currentClass = classSelectRef.current?.value || className;
    setStudentName(currentName);
    setEmail(currentEmail);
    setClassName(currentClass);

    const missingIdentity = [
      currentName.length < 3 ? "họ và tên" : "",
      !/^\S+@\S+\.\S+$/.test(currentEmail) ? "email hợp lệ" : "",
      !currentClass ? "lớp" : "",
    ].filter(Boolean);
    if (missingIdentity.length) {
      setIdentityError(`Em cần kiểm tra lại: ${missingIdentity.join(", ")}.`);
      identityCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (currentName.length < 3) studentNameInputRef.current?.focus();
      else if (!/^\S+@\S+\.\S+$/.test(currentEmail)) emailInputRef.current?.focus();
      else classSelectRef.current?.focus();
      return;
    }
    setIdentityError("");
    if (!micTested || !acknowledged) {
      setError(!micTested ? "Em cần thử micro trước khi ghi chính thức." : "Em cần tích xác nhận đã luyện kỹ.");
      return;
    }
    await startOfficialRecording({ studentName: currentName, email: currentEmail, className: currentClass });
  }

  async function startOfficialRecording(identity: { studentName: string; email: string; className: string }) {
    setError("");
    let stream: MediaStream | null = null;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Thiết bị hoặc trình duyệt này chưa hỗ trợ ghi âm an toàn.");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const activeStream = stream;
      const recorder = new MediaRecorder(activeStream, preferredAudioType() ? { mimeType: preferredAudioType() } : undefined);
      const result = await postToDrive({ action: "start", assignmentCode: ASSIGNMENT_CODE, studentName: identity.studentName, email: identity.email, className: identity.className });
      if (!result.token) {
        activeStream.getTracks().forEach((track) => track.stop());
        throw new Error(result.error || "Không thể bắt đầu lượt ghi âm.");
      }
      streamRef.current = activeStream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setRecorderState("finished");
        activeStream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
      };
      recorder.start(1000);
      setSessionToken(result.token);
      setPart(1);
      setElapsed(0);
      setRecorderState("recording");
      timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(cause instanceof Error ? cause.message : "Không thể bắt đầu lượt ghi âm.");
    }
  }

  function pauseRecording() {
    if (recorderRef.current?.state !== "recording") return;
    recorderRef.current.pause();
    setRecorderState("paused");
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function resumeRecording() {
    if (recorderRef.current?.state !== "paused") return;
    recorderRef.current.resume();
    setRecorderState("recording");
    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
  }

  function nextPart() {
    if (part !== 1) return;
    if (recorderState === "recording") pauseRecording();
    setPart(2);
  }

  function finishRecording() {
    if (part !== 2 || !recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
  }

  async function submitWork() {
    if (!canSubmit || !audioBlob) return;
    setSubmitting(true);
    setError("");
    try {
      setProgressText(images.length ? `Đang ghép ${images.length} ảnh thành PDF theo đúng thứ tự…` : "Đang kiểm tra file PDF…");
      const notebook = pdfFile || await imagesToPdf(images);
      if (notebook.size + audioBlob.size > 25 * 1024 * 1024) {
        throw new Error("Tổng dung lượng PDF và bài ghi âm vượt 25 MB. Em hãy giảm dung lượng ảnh rồi thử lại.");
      }
      setProgressText("Đang chuyển PDF và bài ghi âm vào Google Drive của cô Trang…");
      const [notebookBase64, audioBase64] = await Promise.all([blobToBase64(notebook), blobToBase64(audioBlob)]);
      await postToDrive({
        action: "submit",
        token: sessionToken,
        notebookBase64,
        notebookType: notebook.type || "application/pdf",
        audioBase64,
        audioType: audioBlob.type || "audio/webm",
      });
      setRecorderState("submitted");
      setProgressText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa gửi được bài. Em hãy giữ nguyên trang và thử gửi lại.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isEmbedded) {
    return <main className="launch-screen"><section className="launch-card"><img src={LOGO_URL} alt="Ms. Trang Trieu Education" /><p className="eyebrow">IELTS SPEAKING · BUỔI 01 · MÃ S01</p><h1>Mở phòng ghi âm<br />toàn màn hình</h1><p>Google Sites không thể trực tiếp xin quyền micro cho trang được nhúng. Em hãy mở phòng ghi âm ở cửa sổ riêng; tại đó trình duyệt sẽ hỏi quyền sử dụng micro.</p><ol><li>Bấm nút bên dưới.</li><li>Khi trình duyệt hỏi quyền micro, chọn <strong>Cho phép</strong>.</li><li>Thử micro, chuẩn bị đủ PDF vở chép rồi mới bắt đầu lượt ghi chính thức.</li></ol><button className="launch-button" onClick={openStandaloneRecorder}>MỞ PHÒNG GHI ÂM</button><small>Trang nộp bài vẫn dùng mã S01 và gửi PDF, audio về Google Drive của cô Trang.</small>{error && <p className="inline-error">{error}</p>}</section></main>;
  }

  if (recorderState === "submitted") {
    return <main className="success-screen"><img src={LOGO_URL} alt="Ms. Trang Trieu Education" /><p className="eyebrow">MÃ BÀI · {ASSIGNMENT_CODE}</p><h1>Đã nộp bài thành công</h1><p>Hệ thống đã nhận 01 file PDF vở chép và 01 file ghi âm hoàn chỉnh của <strong>{studentName}</strong>.</p><div className="success-mark">✓</div><small>Em không cần nộp lại lần thứ hai.</small></main>;
  }

  return (
    <main className="recorder-shell">
      <header className="brandbar"><img src={LOGO_URL} alt="Ms. Trang Trieu Education" /><div><strong>MS. TRANG TRIEU EDUCATION</strong><span>IELTS SPEAKING · BUỔI 01</span></div><div className="code-pill">MÃ BÀI · {ASSIGNMENT_CODE}</div></header>
      <section className="hero"><div><p className="eyebrow">NỘP BÀI BUỔI HỌC NÓI SỐ 01</p><h1>Vở chép & bài ghi âm<br />IELTS Speaking Part 1</h1><p className="lead">Ảnh vở được tự ghép thành một PDF. Hai nội dung nói được ghi trong cùng một lượt và nộp thành một tệp âm thanh duy nhất.</p></div><div className="attempt-card"><span>01</span><strong>LƯỢT GHI DUY NHẤT</strong><p>Được dừng tạm và ghi tiếp trong cùng lượt; không được làm lại sau khi đã bắt đầu.</p></div></section>

      <section className="warning-card"><div className="warning-number">!</div><div><h2>Luyện thật kỹ trước khi bắt đầu</h2><p>Em hãy luyện phát âm và câu trả lời nhiều lần, chuẩn bị đủ ý, chọn nơi yên tĩnh và thử micro trước. Chỉ bấm <strong>Bắt đầu bài ghi chính thức</strong> khi đã sẵn sàng, vì mỗi học sinh chỉ có đúng <strong>01 lượt</strong>.</p></div></section>

      <section className="identity-card" ref={identityCardRef}><label>HỌ VÀ TÊN<input ref={studentNameInputRef} value={studentName} onChange={(event) => { setStudentName(event.target.value); setIdentityError(""); }} autoComplete="name" placeholder="Ví dụ: Nguyễn Minh Anh" disabled={recorderState !== "idle"} /></label><label>EMAIL<input ref={emailInputRef} value={email} onChange={(event) => { setEmail(event.target.value); setIdentityError(""); }} type="email" autoComplete="email" placeholder="Email Google của học sinh" disabled={recorderState !== "idle"} /></label><label>LỚP<select ref={classSelectRef} value={className} onChange={(event) => { setClassName(event.target.value); setIdentityError(""); }} disabled={recorderState !== "idle"}><option value="" disabled>Chọn lớp</option>{classes.map((item) => <option key={item}>{item}</option>)}</select></label>{identityError && <p className="identity-error">{identityError}</p>}</section>

      <section className="submission-grid">
        <div className="upload-panel"><p className="eyebrow">01 · VỞ CHÉP LÝ THUYẾT</p><h2>Ảnh tự ghép thành PDF</h2><p><strong>Em phải chọn ảnh đúng thứ tự trang và xoay ảnh đúng chiều trước khi nộp.</strong> Hãy chọn trang 1 trước, rồi trang 2, trang 3… Hệ thống giữ nguyên thứ tự chọn; nếu chọn nhầm, em có thể kéo hoặc dùng nút mũi tên để đổi vị trí.</p><label className="upload-drop"><input className="visually-hidden" type="file" accept="image/*,.heic,.heif,application/pdf" multiple onChange={(event) => { chooseFiles(event.target.files); event.currentTarget.value = ""; }} /><strong>CHỌN ẢNH HOẶC PDF</strong><span>Chọn nhiều ảnh · hoặc 01 file PDF có sẵn</span></label>{uploadError && <p className="inline-error">{uploadError}</p>}{pdfFile && <div className="pdf-chip"><span>PDF</span><div><strong>{pdfFile.name}</strong><small>{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</small></div><button onClick={() => setPdfFile(null)} aria-label="Bỏ file PDF">×</button></div>}{images.length > 0 && <><div className="image-count">Đã chọn {images.length} ảnh · Thứ tự dưới đây chính là thứ tự trong PDF</div><div className="image-list">{images.map((item, index) => <div key={item.id} className="image-card" draggable onDragStart={() => setDraggedId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropImage(item.id)}><div className="page-number">{index + 1}</div><img src={item.preview} style={{ transform: `rotate(${item.rotation}deg)` }} alt={`Trang ${index + 1}`} /><div className="image-actions"><button onClick={() => moveImage(item.id, -1)} disabled={index === 0} aria-label="Đưa lên">↑</button><button onClick={() => moveImage(item.id, 1)} disabled={index === images.length - 1} aria-label="Đưa xuống">↓</button><button onClick={() => rotateImage(item.id)} aria-label="Xoay ảnh">↻</button><button onClick={() => removeImage(item.id)} aria-label="Bỏ ảnh">×</button></div></div>)}</div></>}</div>

        <div className="recording-panel"><p className="eyebrow">02 · BÀI GHI ÂM CHÍNH THỨC</p><div className="recording-steps"><div className={`step ${part === 1 ? "active" : "done"}`}><span>{part === 2 ? "✓" : "1"}</span><div><strong>Luyện âm</strong><p>Đọc phần âm và từ theo yêu cầu trong bài.</p></div></div><div className={`step ${part === 2 ? "active" : ""}`}><span>2</span><div><strong>Trả lời Speaking Part 1</strong><p>Nói lần lượt các câu trả lời đã chuẩn bị.</p></div></div></div><div className="studio"><div className="studio-top"><span className={`status-dot ${recorderState}`} />{statusText}</div><div className="timer">{formatTime(elapsed)}</div><p>{part === 1 ? "Nội dung đang ghi: Luyện âm." : "Nội dung đang ghi: Trả lời Speaking Part 1."} Có thể dừng tạm sau từng câu rồi ghi tiếp.</p><p className="permission-note"><strong>Bước cấp quyền micro:</strong> bấm nút dưới đây, sau đó chọn <strong>Cho phép</strong> khi trình duyệt hỏi.</p><div className="controls">{!micTesting ? <button className="secondary" onClick={startMicTest} disabled={recorderState !== "idle"}>{micTested ? "THỬ LẠI MICRO" : "CHO PHÉP & THỬ MICRO"}</button> : <button className="secondary testing" onClick={stopMicTest}>DỪNG THỬ MICRO</button>}<button className="secondary" onClick={pauseRecording} disabled={recorderState !== "recording"}>DỪNG TẠM</button><button className="secondary" onClick={resumeRecording} disabled={recorderState !== "paused"}>GHI TIẾP</button></div>{recorderState === "idle" && <><label className="confirm-row"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>Em đã luyện kỹ, đã thử micro và hiểu rằng bài ghi chính thức chỉ có 01 lượt.</span></label><button className="primary official-start" onClick={handleOfficialStartClick}>BẮT ĐẦU BÀI GHI CHÍNH THỨC</button>{!readyToStart && <p className="start-hint">Còn thiếu: {missingStartSteps.join(" · ")}.</p>}</>}{micSampleUrl && <div className="mic-review"><strong>Nghe lại đoạn thử micro</strong><audio className="sample-player" src={micSampleUrl} controls><track kind="captions" /></audio></div>}{part === 1 && (recorderState === "recording" || recorderState === "paused") && <button className="primary" onClick={nextPart}>HOÀN TẤT PHẦN 1 · SANG PHẦN 2</button>}{part === 2 && (recorderState === "recording" || recorderState === "paused") && <button className="primary finish" onClick={finishRecording}>HOÀN TẤT BÀI GHI ÂM</button>}{audioUrl && <div className="final-audio"><strong>Nghe lại bài ghi hoàn chỉnh</strong><audio src={audioUrl} controls><track kind="captions" /></audio><small>Chỉ để kiểm tra trước khi nộp; không có nút ghi lại.</small></div>}{error && <p className="inline-error">{error}</p>}</div></div>
      </section>

      <section className="submit-bar"><div><span>HỒ SƠ NỘP BÀI</span><strong>{hasNotebook ? "✓ Vở chép sẵn sàng" : "○ Chưa có vở chép"} · {audioBlob ? "✓ Âm thanh sẵn sàng" : "○ Chưa ghi xong"}</strong></div><button onClick={submitWork} disabled={!canSubmit}>{submitting ? "ĐANG XỬ LÝ…" : "NỘP TOÀN BỘ BÀI S01"}</button>{progressText && <p>{progressText}</p>}</section>
    </main>
  );
}
