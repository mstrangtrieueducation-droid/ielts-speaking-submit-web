"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

type ImageItem = { id: string; file: File; preview: string; rotation: number };
type RecorderState = "idle" | "recording" | "paused" | "ready-part-2" | "finished" | "attempt-error" | "submitted";

type Assignment = {
  code: string;
  lessonNumber: string;
  title: string;
  mode: "s01" | "topic";
};

const S01_ASSIGNMENT: Assignment = {
  code: "S01",
  lessonNumber: "01",
  title: "Giới thiệu tổng quan về IELTS SPEAKING PART 1",
  mode: "s01",
};

const TOPIC_ASSIGNMENTS: Record<string, string> = {
  S02: "Student Life & Study",
  S03: "Neighbours & Houses",
  S04: "Books & Sports",
  S05: "Art & Photography",
  S06: "Music & Films",
  S07: "Friends & Teamwork",
  S10: "Relaxing & Holidays",
  S11: "Internet & Social Media",
  S12: "Learning & Sharing",
  S13: "Weekends & Weather",
  S14: "Roads & Transportation",
  S15: "Being Alone & Everyday Items",
  S16: "Teachers & Advice",
  S19: "Speaking PART II Introduction",
  S20: "Speaking PART III Introduction",
  S21: "Photography & Interesting Places",
  S22: "Attractive Locations & Opinions",
  S23: "Interesting Job & Science Subjects",
  S24: "Role Models & Good Friends",
  S25: "Achievements & Foreign Countries",
  S26: "Films & Historical Periods",
  S27: "Computer Problems & Important Rules",
  S28: "Learning Skills & Important Plants",
  S31: "Disliking Others & Long Journeys",
  S32: "Culture & Peaceful Places",
  S33: "Special Days & Family Members",
  S34: "Competitions & Crowded Places",
  S35: "Children & Interesting People",
  S36: "Cooking & Service",
  S37: "Difficult Tasks & Teaching Others",
  S38: "Intelligence & Adventures",
};

const RESERVED_ASSIGNMENTS: Record<string, string> = {
  S08: "Buổi ôn tập giữa khóa 1 không yêu cầu nộp bài ghi âm trên hệ thống.",
  S09: "Buổi kiểm tra Nói lần 1 không nhận bài tại phòng ghi âm này.",
  S17: "Buổi ôn tập cuối khóa 1 không yêu cầu nộp bài ghi âm trên hệ thống.",
  S18: "Buổi kiểm tra Nói lần 2 không nhận bài tại phòng ghi âm này.",
  S29: "Buổi ôn tập giữa khóa 2 không yêu cầu nộp bài ghi âm trên hệ thống.",
  S30: "Buổi kiểm tra Nói lần 3 không nhận bài tại phòng ghi âm này.",
  S39: "Buổi ôn tập cuối khóa 2 không yêu cầu nộp bài ghi âm trên hệ thống.",
  S40: "Buổi kiểm tra Nói lần 4 không nhận bài tại phòng ghi âm này.",
};

function resolveAssignment() {
  const requestedCode = (new URLSearchParams(window.location.search).get("code") || "S01").trim().toUpperCase();
  if (requestedCode === "S01") return { kind: "active" as const, assignment: S01_ASSIGNMENT };
  const topicTitle = TOPIC_ASSIGNMENTS[requestedCode];
  if (topicTitle) {
    return {
      kind: "active" as const,
      assignment: {
        code: requestedCode,
        lessonNumber: requestedCode.slice(1),
        title: topicTitle,
        mode: "topic" as const,
      },
    };
  }
  if (RESERVED_ASSIGNMENTS[requestedCode]) {
    return { kind: "reserved" as const, code: requestedCode, message: RESERVED_ASSIGNMENTS[requestedCode] };
  }
  return { kind: "invalid" as const, code: requestedCode };
}

const DEFAULT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxTl2x9QL603pa_6jMYoJK1uQqUy8nOs8Y97OSDbwadwOaeXLjqGxHHI-5sy8jU1OXVKg/exec";
const API_BASE = (import.meta.env.VITE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL).trim();
const LOGO_URL = `${import.meta.env.BASE_URL}logo.webp`;
const classes = Array.from({ length: 14 }, (_, index) => `IELTS ${index + 40}`);

type ApiResult = {
  ok: boolean;
  token?: string;
  error?: string;
  notebookUrl?: string;
  audioPart1Url?: string;
  audioPart2Url?: string;
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

async function imagesToPdf(items: ImageItem[], assignmentCode: string) {
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
  return new File([pdfBuffer], `${assignmentCode}-vo-chep.pdf`, { type: "application/pdf" });
}

export default function RecorderStudio() {
  const assignmentResolution = useMemo(resolveAssignment, []);
  const assignment = assignmentResolution.kind === "active" ? assignmentResolution.assignment : S01_ASSIGNMENT;
  const isS01 = assignment.mode === "s01";
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
  const [part1AudioBlob, setPart1AudioBlob] = useState<Blob | null>(null);
  const [part1AudioUrl, setPart1AudioUrl] = useState("");
  const [part2AudioBlob, setPart2AudioBlob] = useState<Blob | null>(null);
  const [part2AudioUrl, setPart2AudioUrl] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
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
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const waveformFrameRef = useRef<number | null>(null);
  const segmentFailedRef = useRef(false);
  const isEmbedded = window.self !== window.top;

  useEffect(() => {
    document.title = assignmentResolution.kind === "active"
      ? `${assignment.code} · ${assignment.title} · IELTS Speaking`
      : `${assignmentResolution.code || "Mã bài"} · Không nhận bài`;
  }, [assignment.code, assignment.title, assignmentResolution]);

  useEffect(() => {
    const protectOfficialAttempt = (event: BeforeUnloadEvent) => {
      if (!starting && !(["recording", "paused", "ready-part-2", "finished", "attempt-error"] as RecorderState[]).includes(recorderState) && !submitting) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectOfficialAttempt);
    return () => window.removeEventListener("beforeunload", protectOfficialAttempt);
  }, [recorderState, starting, submitting]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    stopWaveform();
  }, []);

  useEffect(() => () => {
    if (part1AudioUrl) URL.revokeObjectURL(part1AudioUrl);
  }, [part1AudioUrl]);

  useEffect(() => () => {
    if (part2AudioUrl) URL.revokeObjectURL(part2AudioUrl);
  }, [part2AudioUrl]);

  useEffect(() => () => {
    if (micSampleUrl) URL.revokeObjectURL(micSampleUrl);
  }, [micSampleUrl]);

  const hasNotebook = images.length > 0 || Boolean(pdfFile);
  const identityReady = studentName.trim().length >= 3 && /^\S+@\S+\.\S+$/.test(email.trim()) && Boolean(className);
  const readyToStart = identityReady && acknowledged && micTested && recorderState === "idle";
  const canSubmit = recorderState === "finished"
    && Boolean(part1AudioBlob)
    && (isS01 ? Boolean(part2AudioBlob) && hasNotebook : true)
    && !submitting;
  const missingStartSteps = [
    studentName.trim().length < 3 ? "họ và tên" : "",
    !/^\S+@\S+\.\S+$/.test(email.trim()) ? "email hợp lệ" : "",
    !className ? "lớp" : "",
    !micTested ? "thử micro" : "",
    !acknowledged ? "tích xác nhận đã luyện kỹ" : "",
  ].filter(Boolean);

  const statusText = useMemo(() => ({
    idle: "CHƯA BẮT ĐẦU",
    recording: "ĐANG GHI",
    paused: "ĐANG DỪNG TẠM",
    "ready-part-2": "PHẦN 1 ĐÃ LƯU",
    finished: isS01 ? "ĐÃ GHI XONG 2 PHẦN" : "ĐÃ GHI XONG",
    "attempt-error": "CẦN CÔ KIỂM TRA LƯỢT GHI",
    submitted: "ĐÃ NỘP BÀI",
  }[recorderState]), [isS01, recorderState]);

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

  function stopWaveform() {
    if (waveformFrameRef.current !== null) cancelAnimationFrame(waveformFrameRef.current);
    waveformFrameRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") void audioContextRef.current.close();
    audioContextRef.current = null;
  }

  function startWaveform(stream: MediaStream) {
    stopWaveform();
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const canvas = waveformCanvasRef.current;
    if (!AudioContextConstructor || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    try {
      const audioContext = new AudioContextConstructor();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        const ratio = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.max(320, canvas.clientWidth);
        const height = Math.max(82, canvas.clientHeight);
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
          canvas.width = Math.round(width * ratio);
          canvas.height = Math.round(height * ratio);
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        analyser.getByteFrequencyData(samples);
        const bars = 34;
        const gap = 4;
        const barWidth = Math.max(3, (width - gap * (bars - 1)) / bars);
        for (let index = 0; index < bars; index += 1) {
          const sampleIndex = Math.floor((index / bars) * samples.length * 0.72);
          const amplitude = Math.max(5, (samples[sampleIndex] / 255) * (height - 12));
          const x = index * (barWidth + gap);
          const y = (height - amplitude) / 2;
          context.fillStyle = index % 3 === 0 ? "#7fbab0" : "#2f6661";
          context.fillRect(x, y, barWidth, amplitude);
        }
        waveformFrameRef.current = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      // The visualization is helpful, but it must never prevent or cancel the
      // official recording when an older browser lacks reliable Web Audio.
      stopWaveform();
    }
  }

  async function handleOfficialStartClick() {
    if (starting) return;
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
    setStarting(true);
    await startSegmentRecording(1, { studentName: currentName, email: currentEmail, className: currentClass });
  }

  async function startSegmentRecording(segment: 1 | 2, identity?: { studentName: string; email: string; className: string }) {
    setError("");
    let stream: MediaStream | null = null;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Thiết bị hoặc trình duyệt này chưa hỗ trợ ghi âm an toàn.");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const activeStream = stream;
      // Create/resume Web Audio while this is still part of the user's mic
      // gesture. Some iPhones suspend AudioContext if it is created only after
      // the server round trip; the canvas remains hidden during "starting".
      startWaveform(activeStream);
      const recorder = new MediaRecorder(activeStream, preferredAudioType() ? { mimeType: preferredAudioType() } : undefined);
      if (segment === 1) {
        if (!identity) throw new Error("Thiếu thông tin học sinh để bắt đầu lượt ghi âm.");
        const result = await postToDrive({ action: "start", assignmentCode: assignment.code, studentName: identity.studentName, email: identity.email, className: identity.className });
        if (!result.token) {
          activeStream.getTracks().forEach((track) => track.stop());
          throw new Error(result.error || "Không thể bắt đầu lượt ghi âm.");
        }
        setSessionToken(result.token);
      } else if (!sessionToken || !part1AudioBlob) {
        throw new Error("Phần 1 chưa được lưu; chưa thể bắt đầu Phần 2.");
      }
      streamRef.current = activeStream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      segmentFailedRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        segmentFailedRef.current = true;
        activeStream.getTracks().forEach((track) => track.stop());
        stopWaveform();
        if (timerRef.current) clearInterval(timerRef.current);
        setStarting(false);
        setRecorderState(segment === 1 ? "attempt-error" : "ready-part-2");
        setError("Micro đã bị gián đoạn. Em hãy báo cô Trang để được kiểm tra lượt ghi.");
      };
      activeStream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (recorder.state === "inactive") return;
          segmentFailedRef.current = true;
          recorder.stop();
          setError(segment === 1
            ? isS01
              ? "Micro đã bị tắt khi đang ghi Phần 1. Phần này không được tính là đã hoàn tất; em hãy báo cô Trang để kiểm tra lượt ghi."
              : "Micro đã bị tắt khi đang ghi bài. Bài ghi chưa được tính là hoàn tất; em hãy báo cô Trang để kiểm tra lượt ghi."
            : "Micro đã bị tắt khi đang ghi Phần 2. Phần 1 vẫn được giữ; em có thể mở lại micro và bắt đầu lại Phần 2.");
        };
      });
      recorder.onstop = () => {
        activeStream.getTracks().forEach((track) => track.stop());
        stopWaveform();
        if (timerRef.current) clearInterval(timerRef.current);
        if (segmentFailedRef.current) {
          setStarting(false);
          setRecorderState(segment === 1 ? "attempt-error" : "ready-part-2");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (segment === 1) {
          if (part1AudioUrl) URL.revokeObjectURL(part1AudioUrl);
          setPart1AudioBlob(blob);
          setPart1AudioUrl(URL.createObjectURL(blob));
          setElapsed(0);
          if (isS01) {
            setPart(2);
            setRecorderState("ready-part-2");
          } else {
            setRecorderState("finished");
          }
        } else {
          if (part2AudioUrl) URL.revokeObjectURL(part2AudioUrl);
          setPart2AudioBlob(blob);
          setPart2AudioUrl(URL.createObjectURL(blob));
          setRecorderState("finished");
        }
      };
      recorder.start(1000);
      setPart(segment);
      setElapsed(0);
      setRecorderState("recording");
      setStarting(false);
      timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      stopWaveform();
      setStarting(false);
      if (segment === 2) setRecorderState("ready-part-2");
      setError(cause instanceof Error ? cause.message : "Không thể bắt đầu lượt ghi âm.");
    }
  }

  async function startPart2Recording() {
    if (starting || recorderState !== "ready-part-2" || !part1AudioBlob) return;
    setStarting(true);
    await startSegmentRecording(2);
  }

  function pauseRecording() {
    if (recorderRef.current?.state !== "recording") return;
    recorderRef.current.pause();
    stopWaveform();
    setRecorderState("paused");
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function resumeRecording() {
    if (recorderRef.current?.state !== "paused") return;
    recorderRef.current.resume();
    if (streamRef.current) startWaveform(streamRef.current);
    setRecorderState("recording");
    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
  }

  function finishPart1Recording() {
    if (part !== 1 || !recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
  }

  function finishRecording() {
    if (part !== 2 || !recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
  }

  async function submitWork() {
    if (!canSubmit || !part1AudioBlob || (isS01 && !part2AudioBlob)) return;
    setSubmitting(true);
    setError("");
    try {
      if (!isS01) {
        if (part1AudioBlob.size > 25 * 1024 * 1024) {
          throw new Error("Bản ghi âm vượt 25 MB. Em hãy báo cô Trang để được hỗ trợ.");
        }
        setProgressText(`Đang chuyển bản ghi ${assignment.code} vào Google Drive của cô Trang…`);
        const audioBase64 = await blobToBase64(part1AudioBlob);
        await postToDrive({
          action: "submit",
          token: sessionToken,
          assignmentCode: assignment.code,
          audioBase64,
          audioType: part1AudioBlob.type || "audio/webm",
        });
        setRecorderState("submitted");
        setProgressText("");
        return;
      }

      setProgressText(images.length ? `Đang ghép ${images.length} ảnh thành PDF theo đúng thứ tự…` : "Đang kiểm tra file PDF…");
      const notebook = pdfFile || await imagesToPdf(images, assignment.code);
      if (notebook.size + part1AudioBlob.size + part2AudioBlob!.size > 25 * 1024 * 1024) {
        throw new Error("Tổng dung lượng PDF và hai phần ghi âm vượt 25 MB. Em hãy giảm dung lượng ảnh rồi thử lại.");
      }
      setProgressText("Đang chuyển PDF và hai phần ghi âm vào Google Drive của cô Trang…");
      const [notebookBase64, audioPart1Base64, audioPart2Base64] = await Promise.all([blobToBase64(notebook), blobToBase64(part1AudioBlob), blobToBase64(part2AudioBlob!)]);
      await postToDrive({
        action: "submit",
        token: sessionToken,
        notebookBase64,
        notebookType: notebook.type || "application/pdf",
        audioPart1Base64,
        audioPart1Type: part1AudioBlob.type || "audio/webm",
        audioPart2Base64,
        audioPart2Type: part2AudioBlob!.type || "audio/webm",
      });
      setRecorderState("submitted");
      setProgressText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chưa gửi được bài. Em hãy giữ nguyên trang và thử gửi lại.");
    } finally {
      setSubmitting(false);
    }
  }

  if (assignmentResolution.kind !== "active") {
    const isReserved = assignmentResolution.kind === "reserved";
    return (
      <main className="blocked-screen">
        <section className="blocked-card">
          <img src={LOGO_URL} alt="Ms. Trang Trieu Education" />
          <p className="eyebrow">IELTS SPEAKING · {assignmentResolution.code || "MÃ BÀI"}</p>
          <h1>{isReserved ? "Buổi này không nhận bài" : "Mã bài không hợp lệ"}</h1>
          <p>{isReserved ? assignmentResolution.message : "Đường dẫn này không có mã bài IELTS Speaking hợp lệ. Em hãy mở lại đúng nút nộp bài trong trang học của mình."}</p>
          <small>Không bắt đầu ghi âm tại trang này. Nếu cần hỗ trợ, em hãy báo cô Trang.</small>
        </section>
      </main>
    );
  }

  if (isEmbedded) {
    return (
      <main className="launch-screen">
        <section className="launch-card">
          <img src={LOGO_URL} alt="Ms. Trang Trieu Education" />
          <p className="eyebrow">IELTS SPEAKING · BUỔI {assignment.lessonNumber} · MÃ {assignment.code}</p>
          <h1>Phòng ghi âm<br />IELTS Speaking</h1>
          <p>Em hãy bấm nút bên dưới để vào phòng ghi âm của bài <strong>{assignment.title}</strong>.</p>
          <ol>
            <li>Chọn <strong>Cho phép</strong> khi trình duyệt hỏi quyền sử dụng micro.</li>
            <li>{isS01 ? "Thử micro và chuẩn bị đủ PDF vở chép." : "Luyện kỹ toàn bộ nội dung trước khi bắt đầu."}</li>
            <li>Chỉ bắt đầu bài ghi chính thức khi em đã sẵn sàng.</li>
          </ol>
          <button className="launch-button" onClick={openStandaloneRecorder}>VÀO PHÒNG GHI ÂM</button>
          <small>Mã bài {assignment.code} đã được điền sẵn.</small>
          {error && <p className="inline-error">{error}</p>}
        </section>
      </main>
    );
  }

  if (recorderState === "submitted") {
    return (
      <main className="success-screen">
        <img src={LOGO_URL} alt="Ms. Trang Trieu Education" />
        <p className="eyebrow">MÃ BÀI · {assignment.code}</p>
        <h1>Đã nộp bài thành công</h1>
        <p>{isS01
          ? <>Hệ thống đã nhận 01 file PDF vở chép và 02 file ghi âm riêng của <strong>{studentName}</strong>.</>
          : <>Hệ thống đã nhận bản ghi <strong>{assignment.title}</strong> của <strong>{studentName}</strong>.</>}</p>
        <div className="success-mark">✓</div>
        <small>Em không cần nộp lại lần thứ hai.</small>
      </main>
    );
  }

  return (
    <main className="recorder-shell">
      <header className="brandbar"><img src={LOGO_URL} alt="Ms. Trang Trieu Education" /><div><strong>MS. TRANG TRIEU EDUCATION</strong><span>IELTS SPEAKING · BUỔI {assignment.lessonNumber}</span></div><div className="code-pill">MÃ BÀI · {assignment.code}</div></header>
      <section className="hero">
        <div>
          <p className="eyebrow">NỘP BÀI BUỔI HỌC NÓI SỐ {assignment.lessonNumber}</p>
          {isS01
            ? <><h1>Vở chép & bài ghi âm<br />IELTS Speaking Part 1</h1><p className="lead">Ảnh vở được tự ghép thành một PDF. Phần 1 và Phần 2 được ghi thành hai tệp riêng, sau đó nộp cùng một lần.</p></>
            : <><h1>{assignment.title}</h1><p className="lead">Ghi và nộp 01 bản nói hoàn chỉnh cho đúng mã bài {assignment.code}. Em có thể dừng tạm sau từng câu rồi ghi tiếp trong cùng lượt.</p></>}
        </div>
        <div className="attempt-card"><span>01</span><strong>LƯỢT LÀM DUY NHẤT</strong><p>{isS01 ? "Mỗi phần được dừng tạm và ghi tiếp; phần đã hoàn tất không được ghi lại." : "Bản ghi được dừng tạm và ghi tiếp; sau khi hoàn tất sẽ không có nút ghi lại."}</p></div>
      </section>

      <section className="warning-card"><div className="warning-number">!</div><div><h2>Luyện thật kỹ trước khi bắt đầu</h2><p>Em hãy luyện phát âm và câu trả lời nhiều lần, chuẩn bị đủ ý, chọn nơi yên tĩnh và thử micro trước. Chỉ bấm <strong>Bắt đầu bài ghi chính thức</strong> khi đã sẵn sàng, vì mỗi học sinh chỉ có đúng <strong>01 lượt cho mã {assignment.code}</strong>.</p></div></section>

      <section className="identity-card" ref={identityCardRef}><label>HỌ VÀ TÊN<input ref={studentNameInputRef} value={studentName} onChange={(event) => { setStudentName(event.target.value); setIdentityError(""); }} autoComplete="name" placeholder="Ví dụ: Nguyễn Minh Anh" disabled={starting || recorderState !== "idle"} /></label><label>EMAIL<input ref={emailInputRef} value={email} onChange={(event) => { setEmail(event.target.value); setIdentityError(""); }} type="email" autoComplete="email" placeholder="Email Google của học sinh" disabled={starting || recorderState !== "idle"} /></label><label>LỚP<select ref={classSelectRef} value={className} onChange={(event) => { setClassName(event.target.value); setIdentityError(""); }} disabled={starting || recorderState !== "idle"}><option value="" disabled>Chọn lớp</option>{classes.map((item) => <option key={item}>{item}</option>)}</select></label>{identityError && <p className="identity-error">{identityError}</p>}</section>

      <section className={`submission-grid ${isS01 ? "" : "generic-grid"}`}>
        {isS01 && <div className="upload-panel"><p className="eyebrow">01 · VỞ CHÉP LÝ THUYẾT</p><h2>Ảnh tự ghép thành PDF</h2><p><strong>Em phải chọn ảnh đúng thứ tự trang và xoay ảnh đúng chiều trước khi nộp.</strong> Hãy chọn trang 1 trước, rồi trang 2, trang 3… Hệ thống giữ nguyên thứ tự chọn; nếu chọn nhầm, em có thể kéo hoặc dùng nút mũi tên để đổi vị trí.</p><label className="upload-drop"><input className="visually-hidden" type="file" accept="image/*,.heic,.heif,application/pdf" multiple onChange={(event) => { chooseFiles(event.target.files); event.currentTarget.value = ""; }} /><strong>CHỌN ẢNH HOẶC PDF</strong><span>Chọn nhiều ảnh · hoặc 01 file PDF có sẵn</span></label>{uploadError && <p className="inline-error">{uploadError}</p>}{pdfFile && <div className="pdf-chip"><span>PDF</span><div><strong>{pdfFile.name}</strong><small>{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</small></div><button onClick={() => setPdfFile(null)} aria-label="Bỏ file PDF">×</button></div>}{images.length > 0 && <><div className="image-count">Đã chọn {images.length} ảnh · Thứ tự dưới đây chính là thứ tự trong PDF</div><div className="image-list">{images.map((item, index) => <div key={item.id} className="image-card" draggable onDragStart={() => setDraggedId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropImage(item.id)}><div className="page-number">{index + 1}</div><img src={item.preview} style={{ transform: `rotate(${item.rotation}deg)` }} alt={`Trang ${index + 1}`} /><div className="image-actions"><button onClick={() => moveImage(item.id, -1)} disabled={index === 0} aria-label="Đưa lên">↑</button><button onClick={() => moveImage(item.id, 1)} disabled={index === images.length - 1} aria-label="Đưa xuống">↓</button><button onClick={() => rotateImage(item.id)} aria-label="Xoay ảnh">↻</button><button onClick={() => removeImage(item.id)} aria-label="Bỏ ảnh">×</button></div></div>)}</div></>}</div>}

        <div className="recording-panel">
          <p className="eyebrow">{isS01 ? "02" : "01"} · BÀI GHI ÂM CHÍNH THỨC</p>
          <div className={`recording-steps ${isS01 ? "" : "single-recording-step"}`}>
            {isS01
              ? <><div className={`step ${part === 1 ? "active" : "done"}`}><span>{part === 2 ? "✓" : "1"}</span><div><strong>Phần 1 · Luyện âm</strong><p>Đọc phần âm và từ theo yêu cầu trong bài.</p></div></div><div className={`step ${part === 2 ? "active" : ""}`}><span>2</span><div><strong>Phần 2 · Speaking Part 1</strong><p>Nói lần lượt các câu trả lời đã chuẩn bị.</p></div></div></>
              : <div className="step active"><span>{part1AudioBlob ? "✓" : "1"}</span><div><strong>{assignment.title}</strong><p>Nói lần lượt toàn bộ nội dung đã chuẩn bị cho bài này.</p></div></div>}
          </div>
          <div className="studio">
            <div className="studio-top"><span className={`status-dot ${starting ? "starting" : recorderState}`} />{starting ? (isS01 ? "ĐANG MỞ MICRO CHO PHẦN NÀY" : "ĐANG MỞ MICRO CHO BÀI GHI") : statusText}</div>
            <div className="timer">{formatTime(elapsed)}</div>
            <div className={`waveform-card ${starting ? "starting" : recorderState}`} role="status" aria-live="polite">
              <canvas ref={waveformCanvasRef} aria-label="Sóng âm thanh đang thu" />
              <strong>{starting ? "Đang chuẩn bị bản ghi mới…" : recorderState === "recording" ? "● ÂM THANH ĐANG ĐƯỢC GHI" : recorderState === "paused" ? "ĐÃ DỪNG TẠM · BẤM GHI TIẾP" : recorderState === "ready-part-2" ? "PHẦN 1 ĐÃ LƯU · BẮT ĐẦU BẢN GHI PHẦN 2" : recorderState === "finished" ? (isS01 ? "ĐÃ LƯU ĐỦ HAI BẢN GHI" : "ĐÃ LƯU BẢN GHI") : "Sóng âm sẽ hiện tại đây khi bắt đầu"}</strong>
            </div>
            <p>{isS01 ? (part === 1 ? "Nội dung đang ghi: Phần 1 · Luyện âm." : "Nội dung đang ghi: Phần 2 · Trả lời Speaking Part 1.") : `Nội dung đang ghi: ${assignment.title}.`} Có thể dừng tạm sau từng câu rồi ghi tiếp.</p>
            {(recorderState === "idle" || recorderState === "ready-part-2") && <p className="permission-note"><strong>Bước cấp quyền micro:</strong> bấm nút bắt đầu của phần tương ứng, sau đó chọn <strong>Cho phép</strong> nếu trình duyệt hỏi.</p>}
            <div className="controls">
              {part === 1 && recorderState === "idle" && (!micTesting ? <button className="secondary" onClick={startMicTest} disabled={starting}>{micTested ? "THỬ LẠI MICRO" : "CHO PHÉP & THỬ MICRO"}</button> : <button className="secondary testing" onClick={stopMicTest}>DỪNG THỬ MICRO</button>)}
              <button className="secondary" onClick={pauseRecording} disabled={recorderState !== "recording"}>DỪNG TẠM</button>
              <button className="secondary" onClick={resumeRecording} disabled={recorderState !== "paused"}>GHI TIẾP</button>
            </div>
            {recorderState === "idle" && <><label className="confirm-row"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={starting} /><span>{isS01 ? "Em đã luyện kỹ, đã thử micro và hiểu rằng mỗi phần chỉ được ghi chính thức 01 lần." : `Em đã luyện kỹ, đã thử micro và hiểu rằng mã bài ${assignment.code} chỉ được ghi chính thức 01 lần.`}</span></label><button className="primary official-start" onClick={handleOfficialStartClick} disabled={starting}>{starting ? "ĐANG KẾT NỐI · VUI LÒNG CHỜ…" : (isS01 ? "BẮT ĐẦU GHI PHẦN 1" : "BẮT ĐẦU BÀI GHI CHÍNH THỨC")}</button>{!readyToStart && !starting && <p className="start-hint">Còn thiếu: {missingStartSteps.join(" · ")}.</p>}</>}
            {isS01 && part === 2 && recorderState === "ready-part-2" && <button className="primary official-start" onClick={startPart2Recording} disabled={starting}>{starting ? "ĐANG MỞ MICRO · VUI LÒNG CHỜ…" : "BẮT ĐẦU GHI PHẦN 2"}</button>}
            {micSampleUrl && <div className="mic-review"><strong>Nghe lại đoạn thử micro</strong><audio className="sample-player" src={micSampleUrl} controls><track kind="captions" /></audio></div>}
            {part === 1 && (recorderState === "recording" || recorderState === "paused") && <button className="primary" onClick={finishPart1Recording}>{isS01 ? "HOÀN TẤT & LƯU PHẦN 1" : "HOÀN TẤT & LƯU BẢN GHI"}</button>}
            {isS01 && part === 2 && (recorderState === "recording" || recorderState === "paused") && <button className="primary finish" onClick={finishRecording}>HOÀN TẤT & LƯU PHẦN 2</button>}
            {part1AudioUrl && <div className="final-audio"><strong>{isS01 ? "Bản ghi Phần 1 · Luyện âm" : `Bản ghi · ${assignment.title}`}</strong><audio src={part1AudioUrl} controls><track kind="captions" /></audio><small>{isS01 ? "Phần 1 đã khóa; không có nút ghi lại." : "Bản ghi đã khóa; không có nút ghi lại."}</small></div>}
            {isS01 && part2AudioUrl && <div className="final-audio"><strong>Bản ghi Phần 2 · Speaking Part 1</strong><audio src={part2AudioUrl} controls><track kind="captions" /></audio><small>Phần 2 đã khóa; không có nút ghi lại.</small></div>}
            {error && <p className="inline-error">{error}</p>}
          </div>
        </div>
      </section>

      <section className="submit-bar"><div><span>HỒ SƠ NỘP BÀI · {assignment.code}</span><strong>{isS01 ? <>{hasNotebook ? "✓ Vở chép sẵn sàng" : "○ Chưa có vở chép"} · {part1AudioBlob ? "✓ Phần 1" : "○ Phần 1"} · {part2AudioBlob ? "✓ Phần 2" : "○ Phần 2"}</> : <>{part1AudioBlob ? "✓ Bản ghi sẵn sàng" : "○ Chưa có bản ghi"}</>}</strong></div><button onClick={submitWork} disabled={!canSubmit}>{submitting ? "ĐANG XỬ LÝ…" : (isS01 ? "NỘP PDF + 02 BẢN GHI S01" : `NỘP BẢN GHI ${assignment.code}`)}</button>{progressText && <p>{progressText}</p>}</section>
    </main>
  );
}
