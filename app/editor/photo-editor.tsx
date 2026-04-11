"use client";

import type { Image as KonvaImageShape } from "konva/lib/shapes/Image";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Path,
  Rect,
  Stage,
  Text,
} from "react-konva";
import { IconLayers } from "@/app/components/nav-icons";
import { summaryPolylineToFlatPoints } from "@/lib/strava-polyline";
import {
  formatCalories,
  formatDistanceMeters,
  formatDuration,
  formatElevationMeters,
  formatHeartRate,
  formatSpeedMps,
  type StravaActivity,
} from "@/lib/strava";
import type { LayerToggles, StatKey } from "./layer-types";
import { LayoutPicker } from "./layout-picker";
import {
  layersForPreset,
  preferredExportForPreset,
  type PresetId,
} from "./preset-config";

const CANVAS_W = 1080;
const FEED_H = 1080;
const STORY_H = 1920;

const THEME = {
  bg: "#0A0A0A",
  accent: "#F5F5F5",
  highlight: "#E8FF00",
  glassFill: "rgba(22,22,24,0.62)",
  glassStroke: "rgba(245,245,245,0.14)",
  muted: "rgba(245,245,245,0.55)",
};

const STAT_VALUE_PX = 24;
const STAT_LABEL_PX = 11;

const TOP_W = CANVAS_W - 56;
const TOP_H = 124;
const BOTTOM_W = CANVAS_W - 56;
const BOTTOM_H = 148;
const BOTTOM_H_MINIMAL = 118;
const MAP_CARD_W = 302;
const MAP_CARD_H = 218;
const MAP_PAD_X = 16;
const MAP_HEADER_H = 34;
const ROUTE_BASE_W = MAP_CARD_W - MAP_PAD_X * 2;
const ROUTE_BASE_H = MAP_CARD_H - MAP_HEADER_H - MAP_PAD_X - 10;

const SIDE_COL_W = 300;
const DARK_CARD_W = 700;

const STAT_ORDER: StatKey[] = [
  "distance",
  "duration",
  "avgSpeed",
  "heartRate",
  "elevation",
  "calories",
];

const STAT_ICONS: Record<StatKey, { d: string; fill?: string }> = {
  distance: { d: "M3 19.5h18M6.5 15.5L12 8l5.5 7.5" },
  duration: { d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-12v5l3 2" },
  avgSpeed: { d: "M4 17L13 8l3 3-7 7M16 11l4-4" },
  heartRate: {
    d: "M12 20s-7-4.35-7-9.2A4.2 4.2 0 0 1 12 6.5a4.2 4.2 0 0 1 7 4.3c0 4.85-7 9.2-7 9.2Z",
    fill: "rgba(232,255,0,0.35)",
  },
  elevation: { d: "M3 19.5L10 8l4.5 6.5L17.5 6 21 19.5z" },
  calories: {
    d: "M14.5 4.5c-1 2.5-4 3.5-4 7.5 0 3 2.2 5 4.5 5s4.5-2 4.5-5c0-6.5-6.5-6-5-7.5Z",
    fill: "rgba(232,255,0,0.3)",
  },
};

type ExportFormat = "feed" | "story";

type EditorPositions = {
  top: { x: number; y: number };
  bottom: { x: number; y: number };
  map: { x: number; y: number };
  sideColumn: { x: number; y: number };
  storyStack: { x: number; y: number };
  darkCard: { x: number; y: number };
};

function initialPositions(preset: PresetId, canvasH: number): EditorPositions {
  const cardH = Math.min(720, Math.max(480, Math.round(canvasH * 0.4)));
  const bh = preset === "minimal" ? BOTTOM_H_MINIMAL : BOTTOM_H;
  const bottomY = canvasH - bh - 28;
  const mapCorner = {
    x: CANVAS_W - MAP_CARD_W - 32,
    y: canvasH - MAP_CARD_H - 36,
  };
  const mapFocus = { x: 24, y: 24 };
  return {
    top: { x: 28, y: 24 },
    bottom: { x: 28, y: bottomY },
    map: preset === "mapFocus" ? mapFocus : mapCorner,
    sideColumn: { x: CANVAS_W - 24 - SIDE_COL_W, y: 96 },
    storyStack: { x: 44, y: Math.round(canvasH * 0.08) },
    darkCard: { x: (CANVAS_W - DARK_CARD_W) / 2, y: (canvasH - cardH) / 2 },
  };
}

function coverLayout(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number
): { x: number; y: number; width: number; height: number } {
  const s = Math.max(boxW / imgW, boxH / imgH);
  const w = imgW * s;
  const h = imgH * s;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, width: w, height: h };
}

function clampOverlay(
  pos: { x: number; y: number },
  w: number,
  h: number,
  maxW: number,
  maxH: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(pos.x, maxW - w)),
    y: Math.max(0, Math.min(pos.y, maxH - h)),
  };
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}

function formatActivityDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function heartRateVisible(a: StravaActivity | null): boolean {
  if (!a) return false;
  return (
    Boolean(a.has_heartrate) ||
    (a.average_heartrate != null && a.average_heartrate > 0)
  );
}

function valueColor(key: StatKey): string {
  return key === "distance" || key === "duration"
    ? THEME.highlight
    : THEME.accent;
}

function getStageCanvas(stage: KonvaStage): HTMLCanvasElement | null {
  const content = stage.getContent();
  if (!content) return null;
  const el = content.querySelector("canvas");
  return el instanceof HTMLCanvasElement ? el : null;
}

async function recordStageWithVideo(
  stage: KonvaStage,
  video: HTMLVideoElement,
  maxSeconds: number
): Promise<Blob | null> {
  const canvas = getStageCanvas(stage);
  if (!canvas) return null;

  const duration = Math.min(
    maxSeconds,
    Number.isFinite(video.duration) ? video.duration : maxSeconds
  );

  const mimeCandidates = [
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return null;

  video.pause();
  video.currentTime = 0;
  try {
    await video.play();
  } catch {
    return null;
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const stopped = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  let raf = 0;
  const drawLoop = () => {
    stage.getLayers().forEach((l) => l.batchDraw());
    raf = requestAnimationFrame(drawLoop);
  };
  raf = requestAnimationFrame(drawLoop);
  rec.start(100);

  await new Promise<void>((resolve) => {
    const cap = duration * 1000;
    const t0 = performance.now();
    const tick = () => {
      if (performance.now() - t0 >= cap || video.ended) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });

  cancelAnimationFrame(raf);
  video.pause();
  rec.stop();
  const out = await stopped;
  return out.size > 0 ? out : null;
}

function StatIcon({
  kind,
  x,
  y,
  strokeColor,
}: {
  kind: StatKey;
  x: number;
  y: number;
  strokeColor: string;
}) {
  const icon = STAT_ICONS[kind];
  const hasFill = Boolean(icon.fill);
  return (
    <Path
      x={x}
      y={y}
      data={icon.d}
      scaleX={1.05}
      scaleY={1.05}
      fill={hasFill ? icon.fill : undefined}
      stroke={hasFill ? undefined : strokeColor}
      strokeWidth={hasFill ? 0 : 1.85}
      lineCap="round"
      lineJoin="round"
    />
  );
}

async function stageToBlob(stage: KonvaStage): Promise<Blob | null> {
  const uri = stage.toDataURL({
    mimeType: "image/png",
    quality: 1,
    pixelRatio: 1,
  });
  const res = await fetch(uri);
  return res.blob();
}

function LayersPanel({
  layers,
  toggle,
  setAllStats,
  checkClass,
  labelClass,
}: {
  layers: LayerToggles;
  toggle: (key: keyof LayerToggles) => void;
  setAllStats: (on: boolean) => void;
  checkClass: string;
  labelClass: string;
}) {
  return (
    <>
      <div>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#F5F5F5]/45">
          Layers
        </h2>
        <p className="mt-1 text-xs text-[#F5F5F5]/40">
          Toggle overlays. Groups are draggable on the canvas.
        </p>
      </div>

      <div className="space-y-2">
        {(
          [
            ["topBar", "Top bar (title & date)"],
            ["bottomBar", "Bottom stats bar"],
            ["map", "Route map"],
          ] as const
        ).map(([key, lbl]) => (
          <label key={key} className="block">
            <input
              type="checkbox"
              className={checkClass}
              checked={layers[key]}
              onChange={() => toggle(key)}
            />
            <span className={labelClass}>{lbl}</span>
          </label>
        ))}
      </div>

      <div className="border-t border-[#F5F5F5]/10 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#F5F5F5]/45">
            Stats
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setAllStats(true)}
              className="min-h-9 rounded-md px-2 py-1 text-xs font-bold text-[#E8FF00] hover:bg-[#E8FF00]/10"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setAllStats(false)}
              className="min-h-9 rounded-md px-2 py-1 text-xs font-bold text-[#F5F5F5]/40 hover:bg-[#F5F5F5]/5"
            >
              None
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {(
            [
              ["distance", "Distance"],
              ["duration", "Duration"],
              ["avgSpeed", "Avg speed"],
              ["heartRate", "Heart rate"],
              ["elevation", "Elevation"],
              ["calories", "Calories"],
            ] as const
          ).map(([key, lbl]) => (
            <label key={key} className="block">
              <input
                type="checkbox"
                className={checkClass}
                checked={layers[key]}
                onChange={() => toggle(key)}
              />
              <span className={labelClass}>{lbl}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

export type PhotoEditorProps = {
  activities: StravaActivity[];
  appUrl: string;
};

export default function PhotoEditor({ activities, appUrl }: PhotoEditorProps) {
  const stageRef = useRef<KonvaStage | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const mediaKonvaRef = useRef<KonvaImageShape | null>(null);
  const videoFileRef = useRef<File | null>(null);

  const [presetId, setPresetId] = useState<PresetId>("full");
  const [layoutTransition, setLayoutTransition] = useState(false);

  const [exportFormat, setExportFormat] = useState<ExportFormat>("feed");
  const canvasH = exportFormat === "feed" ? FEED_H : STORY_H;

  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoTooLong, setVideoTooLong] = useState(false);
  const [videoWarningDismissed, setVideoWarningDismissed] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [videoIntrinsic, setVideoIntrinsic] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const [layers, setLayers] = useState<LayerToggles>(() =>
    layersForPreset("full")
  );
  const [selectedId, setSelectedId] = useState<string>(() =>
    activities[0] ? String(activities[0].id) : ""
  );
  const [layersOpen, setLayersOpen] = useState(false);
  const [viewScale, setViewScale] = useState(0.35);

  const [positions, setPositions] = useState<EditorPositions>(() =>
    initialPositions("full", FEED_H)
  );

  const applyPreset = useCallback((id: PresetId, canvasHeight: number) => {
    setPresetId(id);
    setLayers(layersForPreset(id));
    const pref = preferredExportForPreset(id);
    if (pref === "story") {
      setExportFormat("story");
      setPositions(initialPositions(id, STORY_H));
    } else {
      setPositions(initialPositions(id, canvasHeight));
    }
  }, []);

  const handleSelectPreset = useCallback(
    (id: PresetId) => {
      if (id === presetId) return;
      setLayoutTransition(true);
      window.setTimeout(() => {
        const h =
          preferredExportForPreset(id) === "story"
            ? STORY_H
            : exportFormat === "story"
              ? STORY_H
              : FEED_H;
        applyPreset(id, h);
        window.requestAnimationFrame(() => setLayoutTransition(false));
      }, 220);
    },
    [applyPreset, exportFormat, presetId]
  );

  const setExportFormatAndReset = useCallback(
    (f: ExportFormat) => {
      setExportFormat(f);
      const h = f === "feed" ? FEED_H : STORY_H;
      setPositions(initialPositions(presetId, h));
    },
    [presetId]
  );

  useLayoutEffect(() => {
    const el = canvasHostRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      const sw = Math.max(0, r.width);
      const sh = Math.max(0, r.height);
      if (sw < 8 || sh < 8) return;
      const s = Math.min(sw / CANVAS_W, sh / canvasH) * 0.98;
      setViewScale(s);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasH]);

  useEffect(() => {
    if (!videoEl || !videoPlaying) return;
    let raf = 0;
    const loop = () => {
      mediaKonvaRef.current?.getLayer()?.batchDraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [videoEl, videoPlaying]);

  const selected = useMemo(
    () => activities.find((x) => String(x.id) === selectedId) ?? null,
    [activities, selectedId]
  );

  const showHr = heartRateVisible(selected);

  const mapFocusDims = useMemo(() => {
    const mw = Math.round(CANVAS_W * 0.4);
    const mh = canvasH - 48;
    const routeW = mw - MAP_PAD_X * 2;
    const routeH = mh - MAP_HEADER_H - MAP_PAD_X - 10;
    return { mw, mh, routeW, routeH };
  }, [canvasH]);

  const routePointsDefault = useMemo(() => {
    const encoded = selected?.map?.summary_polyline;
    return summaryPolylineToFlatPoints(encoded, ROUTE_BASE_W, ROUTE_BASE_H, 4);
  }, [selected]);

  const routePointsMapFocus = useMemo(() => {
    const encoded = selected?.map?.summary_polyline;
    return summaryPolylineToFlatPoints(
      encoded,
      mapFocusDims.routeW,
      mapFocusDims.routeH,
      4
    );
  }, [selected, mapFocusDims]);

  const hasRouteDefault = routePointsDefault.length >= 4;
  const hasRouteFocus = routePointsMapFocus.length >= 4;

  const statValues = useMemo(() => {
    if (!selected) {
      return {
        distance: "—",
        duration: "—",
        avgSpeed: "—",
        heartRate: "—",
        elevation: "—",
        calories: "—",
      } as Record<StatKey, string>;
    }
    return {
      distance: formatDistanceMeters(selected.distance),
      duration: formatDuration(selected.moving_time),
      avgSpeed: formatSpeedMps(selected.average_speed),
      heartRate: showHr
        ? formatHeartRate(selected.average_heartrate ?? undefined)
        : "—",
      elevation: formatElevationMeters(selected.total_elevation_gain),
      calories: formatCalories(selected.calories ?? undefined),
    };
  }, [selected, showHr]);

  const visibleStats = STAT_ORDER.filter((k) => layers[k]);

  const bottomBarH =
    presetId === "minimal" ? BOTTOM_H_MINIMAL : BOTTOM_H;

  const bottomStatLayout = useMemo(() => {
    const stats = STAT_ORDER.filter((k) => layers[k]);
    if (!layers.bottomBar || stats.length === 0) {
      return { cells: [] as { key: StatKey; x: number; w: number }[] };
    }
    const gap = 18;
    const innerPad = 36;
    const innerW = BOTTOM_W - innerPad * 2;
    const n = stats.length;
    const cellW = Math.min(168, (innerW - gap * (n - 1)) / n);
    const rowW = n * cellW + (n - 1) * gap;
    let x = innerPad + (innerW - rowW) / 2;
    const cells = stats.map((key) => {
      const cx = x;
      x += cellW + gap;
      return { key, x: cx, w: cellW };
    });
    return { cells };
  }, [layers]);

  const showClassicBottom =
    (presetId === "minimal" || presetId === "full") &&
    layers.bottomBar &&
    visibleStats.length > 0;

  const showClassicMap =
    (presetId === "minimal" || presetId === "full") && layers.map;

  const showClassicTop = presetId === "full" && layers.topBar;

  const onPickMedia = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type.startsWith("video/")) {
      if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
        return;
      }
      videoFileRef.current = file;
      setVideoIntrinsic(null);
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = url;
      v.onloadedmetadata = () => {
        setVideoTooLong(v.duration > 15);
        setVideoWarningDismissed(false);
        setVideoIntrinsic({
          w: v.videoWidth || 1080,
          h: v.videoHeight || 1920,
        });
      };
      setPhoto((prev) => {
        if (prev?.src.startsWith("blob:")) URL.revokeObjectURL(prev.src);
        return null;
      });
      setVideoEl((prev) => {
        if (prev?.src.startsWith("blob:")) URL.revokeObjectURL(prev.src);
        return v;
      });
      setVideoPlaying(false);
      return;
    }

    if (!file.type.startsWith("image/")) return;
    videoFileRef.current = null;
    setVideoIntrinsic(null);
    setVideoEl((prev) => {
      if (prev?.src.startsWith("blob:")) URL.revokeObjectURL(prev.src);
      return null;
    });
    setVideoTooLong(false);
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setPhoto((prev) => {
        if (prev?.src.startsWith("blob:")) URL.revokeObjectURL(prev.src);
        return img;
      });
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, []);

  const toggleVideoPlay = useCallback(() => {
    const v = videoEl;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setVideoPlaying(true);
    } else {
      v.pause();
      setVideoPlaying(false);
    }
  }, [videoEl]);

  const triggerDownload = useCallback(
    (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    []
  );

  const exportFilenameBase = useCallback(() => {
    const host = (() => {
      const base = appUrl.trim() || "http://localhost:3000";
      try {
        return new URL(base).hostname.replace(/[^a-z0-9.-]/gi, "_");
      } catch {
        return "export";
      }
    })();
    return `fitshot-${host}-${exportFormat}-${Date.now()}`;
  }, [appUrl, exportFormat]);

  const getExportBlob = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return null;
    return stageToBlob(stage);
  }, []);

  const shareOrExportVideo = useCallback(async () => {
    const stage = stageRef.current;
    const v = videoEl;
    const file = videoFileRef.current;
    if (!stage || !v || !file) return null;

    setExportBusy(true);
    try {
      const recorded = await recordStageWithVideo(stage, v, 15);
      if (recorded && recorded.size > 0) {
        const ext = recorded.type.includes("mp4") ? "mp4" : "webm";
        return new File([recorded], `${exportFilenameBase()}.${ext}`, {
          type: recorded.type,
        });
      }
      return new File([file], file.name, { type: file.type });
    } finally {
      setExportBusy(false);
    }
  }, [exportFilenameBase, videoEl]);

  const downloadPng = useCallback(async () => {
    if (videoEl) {
      setExportBusy(true);
      try {
        const f = await shareOrExportVideo();
        if (f) triggerDownload(f, f.name);
      } finally {
        setExportBusy(false);
      }
      return;
    }
    const blob = await getExportBlob();
    if (!blob) return;
    triggerDownload(blob, `${exportFilenameBase()}.png`);
  }, [
    exportFilenameBase,
    getExportBlob,
    shareOrExportVideo,
    triggerDownload,
    videoEl,
  ]);

  const shareMedia = useCallback(async () => {
    if (videoEl && videoFileRef.current) {
      setExportBusy(true);
      try {
        const shareFile = await shareOrExportVideo();
        if (!shareFile) return;
        try {
          if (
            navigator.share &&
            typeof navigator.canShare === "function" &&
            navigator.canShare({ files: [shareFile] })
          ) {
            await navigator.share({ files: [shareFile], title: "Fitshot" });
            return;
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
        triggerDownload(shareFile, shareFile.name);
      } finally {
        setExportBusy(false);
      }
      return;
    }

    const blob = await getExportBlob();
    if (!blob) return;
    const name = `${exportFilenameBase()}.png`;
    const file = new File([blob], name, { type: "image/png" });

    try {
      if (
        navigator.share &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: "Fitshot" });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }

    triggerDownload(blob, name);
  }, [exportFilenameBase, getExportBlob, shareOrExportVideo, triggerDownload, videoEl]);

  const titleText = selected
    ? truncate(selected.name || "Activity", 42)
    : "Select an activity";
  const dateText = selected ? formatActivityDate(selected.start_date) : "";

  const toggle = useCallback((key: keyof LayerToggles) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setAllStats = useCallback((on: boolean) => {
    setLayers((prev) => ({
      ...prev,
      distance: on,
      duration: on,
      avgSpeed: on,
      heartRate: on,
      elevation: on,
      calories: on,
    }));
  }, []);

  const checkClass = "peer sr-only";
  const labelClass =
    "glass-panel flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#F5F5F5] transition-colors peer-checked:border-[#E8FF00]/50 peer-checked:bg-[#E8FF00]/[0.08] sm:min-h-0 sm:rounded-lg sm:py-2";

  const previewW = CANVAS_W * viewScale;
  const previewH = canvasH * viewScale;

  const darkCardH = Math.min(720, Math.max(480, Math.round(canvasH * 0.4)));

  const mediaCover = useMemo(() => {
    if (photo) {
      return coverLayout(
        photo.naturalWidth,
        photo.naturalHeight,
        CANVAS_W,
        canvasH
      );
    }
    if (videoEl && videoIntrinsic) {
      return coverLayout(
        videoIntrinsic.w,
        videoIntrinsic.h,
        CANVAS_W,
        canvasH
      );
    }
    return coverLayout(CANVAS_W, canvasH, CANVAS_W, canvasH);
  }, [photo, videoEl, videoIntrinsic, canvasH]);

  const statLabel = (text: string, x: number, y: number, w: number) => (
    <Text
      x={x}
      y={y}
      width={w}
      text={text}
      fontSize={STAT_LABEL_PX}
      fontStyle="bold"
      fontFamily="Inter, system-ui, sans-serif"
      fill={THEME.muted}
      letterSpacing={1.2}
    />
  );

  const mediaSource = photo ?? videoEl ?? undefined;

  const storyStats = STAT_ORDER.filter((k) => layers[k]);
  const storyPanelH = Math.min(
    canvasH - 160,
    storyStats.length * 72 + 100
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 font-[family-name:var(--font-inter)] sm:gap-4 lg:max-w-6xl">
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
        <aside className="glass-panel hidden w-64 shrink-0 space-y-4 rounded-2xl p-4 lg:block">
          <LayersPanel
            layers={layers}
            toggle={toggle}
            setAllStats={setAllStats}
            checkClass={checkClass}
            labelClass={labelClass}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:gap-3">
          <LayoutPicker
            value={presetId}
            onChange={handleSelectPreset}
            transitioning={layoutTransition}
          />

          <div className="shrink-0 space-y-2 sm:space-y-3">
            <div className="flex flex-wrap items-stretch gap-2 sm:items-center sm:gap-3">
              <label className="inline-flex min-h-12 flex-1 cursor-pointer sm:flex-none sm:min-h-10">
                <input
                  type="file"
                  accept="image/*,video/mp4"
                  className="sr-only"
                  onChange={onPickMedia}
                />
                <span className="glass-panel inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-bold text-[#F5F5F5] transition hover:bg-[#F5F5F5]/[0.08] active:scale-[0.99] sm:min-h-10 sm:rounded-full sm:px-5">
                  Upload photo or MP4
                </span>
              </label>

              {videoEl ? (
                <button
                  type="button"
                  onClick={toggleVideoPlay}
                  className="glass-panel flex min-h-12 min-w-[7rem] items-center justify-center rounded-2xl px-4 text-sm font-bold text-[#E8FF00] sm:min-h-10 sm:rounded-full"
                >
                  {videoPlaying ? "Pause" : "Play"}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setLayersOpen(true)}
                className="glass-panel flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold text-[#F5F5F5] lg:hidden sm:min-h-10 sm:flex-none sm:rounded-full"
              >
                <IconLayers className="h-5 w-5 text-[#E8FF00]" />
                Layers
              </button>
            </div>

            {videoTooLong && !videoWarningDismissed ? (
              <div className="glass-panel flex items-start gap-3 rounded-2xl border border-[#E8FF00]/35 bg-[#E8FF00]/10 px-3 py-2.5 text-sm text-[#F5F5F5]">
                <p className="flex-1">
                  This video is longer than 15 seconds. Trim it before posting
                  to Instagram Stories for best results.
                </p>
                <button
                  type="button"
                  className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-[#E8FF00]"
                  onClick={() => setVideoWarningDismissed(true)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label
                htmlFor="editor-activity"
                className="text-[11px] font-semibold uppercase tracking-wider text-[#F5F5F5]/50 sm:text-xs"
              >
                Activity
              </label>
              <select
                id="editor-activity"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="glass-panel min-h-12 w-full rounded-2xl bg-[#141414] px-3 text-sm font-semibold text-[#F5F5F5] sm:min-h-10 sm:min-w-[220px] sm:rounded-full"
              >
                {activities.length === 0 ? (
                  <option value="">No activities</option>
                ) : (
                  activities.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {truncate(a.name || "Activity", 36)}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div
                className="glass-panel flex rounded-2xl p-1 sm:rounded-full"
                role="group"
                aria-label="Export shape"
              >
                <button
                  type="button"
                  onClick={() => setExportFormatAndReset("feed")}
                  className={`min-h-11 flex-1 rounded-xl px-3 text-xs font-extrabold transition sm:min-h-9 sm:rounded-full sm:px-4 sm:text-sm ${
                    exportFormat === "feed"
                      ? "bg-[#E8FF00] text-[#0A0A0A] shadow-md"
                      : "text-[#F5F5F5]/50"
                  }`}
                >
                  Feed 1080×1080
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormatAndReset("story")}
                  className={`min-h-11 flex-1 rounded-xl px-3 text-xs font-extrabold transition sm:min-h-9 sm:rounded-full sm:px-4 sm:text-sm ${
                    exportFormat === "story"
                      ? "bg-[#E8FF00] text-[#0A0A0A] shadow-md"
                      : "text-[#F5F5F5]/50"
                  }`}
                >
                  Story 1080×1920
                </button>
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px]">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => void shareMedia()}
                    className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#E8FF00] px-4 text-sm font-extrabold text-[#0A0A0A] shadow-lg shadow-[#E8FF00]/20 transition enabled:active:scale-[0.99] disabled:opacity-50 sm:min-h-11 sm:flex-1 sm:rounded-full"
                  >
                    {exportBusy ? "Working…" : videoEl ? "Share video" : "Share image"}
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => void downloadPng()}
                    className="glass-panel flex min-h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-extrabold text-[#F5F5F5] disabled:opacity-50 sm:min-h-11 sm:w-auto sm:rounded-full"
                  >
                    Download
                  </button>
                </div>
                <p className="text-center text-[11px] font-medium leading-snug text-[#F5F5F5]/45 sm:text-xs">
                  Select Instagram from the share menu
                </p>
              </div>
            </div>
          </div>

          {activities.length === 0 ? (
            <p className="shrink-0 text-sm font-medium text-[#E8FF00]/90">
              No Strava activities loaded.{" "}
              <Link href="/connect" className="font-bold underline">
                Reconnect
              </Link>
            </p>
          ) : null}

          <div
            ref={canvasHostRef}
            className="relative flex min-h-0 min-h-[40dvh] w-full flex-1 touch-manipulation items-center justify-center sm:min-h-[50vh] lg:min-h-[min(70dvh,720px)]"
          >
            <div
              className={`relative overflow-hidden rounded-2xl border border-[#F5F5F5]/10 bg-[#141414] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.65)] transition-all duration-300 ease-out ${
                layoutTransition ? "scale-[0.98] opacity-40" : "scale-100 opacity-100"
              }`}
              style={{
                width: previewW,
                height: previewH,
                maxWidth: "100%",
              }}
            >
              <div
                style={{
                  width: CANVAS_W,
                  height: canvasH,
                  transform: `scale(${viewScale})`,
                  transformOrigin: "top left",
                }}
              >
                <Stage width={CANVAS_W} height={canvasH} ref={stageRef}>
                  <Layer>
                    {mediaSource ? (
                      <KonvaImage
                        ref={mediaKonvaRef}
                        image={mediaSource}
                        listening={false}
                        {...mediaCover}
                      />
                    ) : (
                      <Rect
                        x={0}
                        y={0}
                        width={CANVAS_W}
                        height={canvasH}
                        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                        fillLinearGradientEndPoint={{ x: CANVAS_W, y: canvasH }}
                        fillLinearGradientColorStops={[
                          0,
                          "#121212",
                          1,
                          THEME.bg,
                        ]}
                      />
                    )}

                    {showClassicTop ? (
                      <Group
                        x={positions.top.x}
                        y={positions.top.y}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(pos, TOP_W, TOP_H, CANVAS_W, canvasH)
                        }
                        onDragEnd={(e) =>
                          setPositions((p) => ({
                            ...p,
                            top: { x: e.target.x(), y: e.target.y() },
                          }))
                        }
                      >
                        <Rect
                          width={TOP_W}
                          height={TOP_H}
                          cornerRadius={22}
                          fill={THEME.glassFill}
                          stroke={THEME.glassStroke}
                          strokeWidth={1}
                          shadowColor="rgba(0,0,0,0.5)"
                          shadowBlur={32}
                          shadowOffsetY={12}
                          shadowOpacity={0.55}
                        />
                        <Text
                          x={28}
                          y={28}
                          width={TOP_W - 56}
                          text={titleText}
                          fontSize={32}
                          fontStyle="bold"
                          fontFamily="Inter, system-ui, sans-serif"
                          fill={THEME.accent}
                          letterSpacing={-0.5}
                          lineHeight={1.15}
                        />
                        {dateText ? (
                          <Text
                            x={28}
                            y={76}
                            width={TOP_W - 56}
                            text={dateText}
                            fontSize={16}
                            fontStyle="bold"
                            fontFamily="Inter, system-ui, sans-serif"
                            fill={THEME.muted}
                            letterSpacing={0.2}
                          />
                        ) : null}
                      </Group>
                    ) : null}

                    {showClassicBottom ? (
                      <Group
                        x={positions.bottom.x}
                        y={positions.bottom.y}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(
                            pos,
                            BOTTOM_W,
                            bottomBarH,
                            CANVAS_W,
                            canvasH
                          )
                        }
                        onDragEnd={(e) =>
                          setPositions((p) => ({
                            ...p,
                            bottom: { x: e.target.x(), y: e.target.y() },
                          }))
                        }
                      >
                        <Rect
                          width={BOTTOM_W}
                          height={bottomBarH}
                          cornerRadius={22}
                          fill={THEME.glassFill}
                          stroke={THEME.glassStroke}
                          strokeWidth={1}
                          shadowColor="rgba(0,0,0,0.5)"
                          shadowBlur={28}
                          shadowOffsetY={10}
                          shadowOpacity={0.5}
                        />
                        {bottomStatLayout.cells.map(({ key, x: cx, w: cw }) => (
                          <Group key={key} x={cx} y={presetId === "minimal" ? 18 : 34}>
                            <StatIcon
                              kind={key}
                              x={(cw - 26) / 2}
                              y={0}
                              strokeColor={THEME.accent}
                            />
                            {presetId === "minimal" ? (
                              <>
                                {statLabel(
                                  key === "distance"
                                    ? "DISTANCE"
                                    : "TIME",
                                  0,
                                  44,
                                  cw
                                )}
                                <Text
                                  x={0}
                                  y={62}
                                  width={cw}
                                  align="center"
                                  text={statValues[key]}
                                  fontSize={STAT_VALUE_PX}
                                  fontStyle="bold"
                                  fontFamily="Inter, system-ui, sans-serif"
                                  fill={valueColor(key)}
                                  letterSpacing={-0.3}
                                />
                              </>
                            ) : (
                              <Text
                                x={0}
                                y={34}
                                width={cw}
                                align="center"
                                text={statValues[key]}
                                fontSize={STAT_VALUE_PX}
                                fontStyle="bold"
                                fontFamily="Inter, system-ui, sans-serif"
                                fill={valueColor(key)}
                                letterSpacing={-0.3}
                              />
                            )}
                          </Group>
                        ))}
                      </Group>
                    ) : null}

                    {presetId === "mapFocus" && layers.map ? (
                      <Group
                        x={positions.map.x}
                        y={positions.map.y}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(
                            pos,
                            mapFocusDims.mw,
                            mapFocusDims.mh,
                            CANVAS_W,
                            canvasH
                          )
                        }
                        onDragEnd={(e) =>
                          setPositions((p) => ({
                            ...p,
                            map: { x: e.target.x(), y: e.target.y() },
                          }))
                        }
                      >
                        <Rect
                          width={mapFocusDims.mw}
                          height={mapFocusDims.mh}
                          cornerRadius={24}
                          fill={THEME.glassFill}
                          stroke={THEME.glassStroke}
                          strokeWidth={1}
                          shadowColor="rgba(0,0,0,0.55)"
                          shadowBlur={36}
                          shadowOffsetY={14}
                          shadowOpacity={0.55}
                        />
                        <Text
                          x={MAP_PAD_X}
                          y={12}
                          text="ROUTE"
                          fontSize={STAT_LABEL_PX}
                          fontStyle="bold"
                          fontFamily="Inter, system-ui, sans-serif"
                          fill={THEME.muted}
                          letterSpacing={2}
                        />
                        <Group
                          x={MAP_PAD_X}
                          y={MAP_HEADER_H}
                          clipFunc={(ctx) => {
                            ctx.beginPath();
                            ctx.roundRect(
                              0,
                              0,
                              mapFocusDims.routeW,
                              mapFocusDims.routeH,
                              14
                            );
                          }}
                        >
                          <Rect
                            x={0}
                            y={0}
                            width={mapFocusDims.routeW}
                            height={mapFocusDims.routeH}
                            fill="rgba(255,255,255,0.04)"
                          />
                          {hasRouteFocus ? (
                            <Line
                              points={routePointsMapFocus}
                              stroke={THEME.highlight}
                              strokeWidth={5}
                              lineCap="round"
                              lineJoin="round"
                              shadowColor="rgba(232,255,0,0.35)"
                              shadowBlur={14}
                              shadowOpacity={0.9}
                            />
                          ) : (
                            <Text
                              x={0}
                              y={mapFocusDims.routeH / 2 - 10}
                              width={mapFocusDims.routeW}
                              align="center"
                              text="No GPS track"
                              fontSize={14}
                              fontStyle="bold"
                              fontFamily="Inter, system-ui, sans-serif"
                              fill={THEME.muted}
                            />
                          )}
                        </Group>
                      </Group>
                    ) : null}

                    {presetId === "mapFocus"
                      ? (() => {
                          const stats = STAT_ORDER.filter((k) => layers[k]);
                          const rowH = 56;
                          const colW = SIDE_COL_W - 40;
                          return (
                            <Group
                              x={positions.sideColumn.x}
                              y={positions.sideColumn.y}
                              draggable
                              dragBoundFunc={(pos) =>
                                clampOverlay(
                                  pos,
                                  SIDE_COL_W,
                                  stats.length * rowH + 40,
                                  CANVAS_W,
                                  canvasH
                                )
                              }
                              onDragEnd={(e) =>
                                setPositions((p) => ({
                                  ...p,
                                  sideColumn: {
                                    x: e.target.x(),
                                    y: e.target.y(),
                                  },
                                }))
                              }
                            >
                              <Rect
                                width={SIDE_COL_W}
                                height={stats.length * rowH + 36}
                                cornerRadius={20}
                                fill={THEME.glassFill}
                                stroke={THEME.glassStroke}
                                strokeWidth={1}
                                shadowColor="rgba(0,0,0,0.45)"
                                shadowBlur={24}
                                shadowOffsetY={8}
                                shadowOpacity={0.5}
                              />
                              {stats.map((key, i) => (
                                <Group key={key} x={20} y={18 + i * rowH}>
                                  <StatIcon
                                    kind={key}
                                    x={0}
                                    y={4}
                                    strokeColor={THEME.accent}
                                  />
                                  <Text
                                    x={34}
                                    y={0}
                                    width={colW}
                                    text={key.toUpperCase()}
                                    fontSize={STAT_LABEL_PX}
                                    fontStyle="bold"
                                    fontFamily="Inter, system-ui, sans-serif"
                                    fill={THEME.muted}
                                    letterSpacing={1}
                                  />
                                  <Text
                                    x={34}
                                    y={22}
                                    width={colW}
                                    text={statValues[key]}
                                    fontSize={STAT_VALUE_PX}
                                    fontStyle="bold"
                                    fontFamily="Inter, system-ui, sans-serif"
                                    fill={valueColor(key)}
                                  />
                                </Group>
                              ))}
                            </Group>
                          );
                        })()
                      : null}

                    {presetId === "storyMode" ? (
                      <Group
                        x={positions.storyStack.x}
                        y={positions.storyStack.y}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(pos, 400, storyPanelH, CANVAS_W, canvasH)
                        }
                        onDragEnd={(e) =>
                          setPositions((p) => ({
                            ...p,
                            storyStack: {
                              x: e.target.x(),
                              y: e.target.y(),
                            },
                          }))
                        }
                      >
                        <Rect
                          width={400}
                          height={storyPanelH}
                          cornerRadius={24}
                          fill={THEME.glassFill}
                          stroke={THEME.glassStroke}
                          strokeWidth={1}
                          shadowColor="rgba(0,0,0,0.5)"
                          shadowBlur={32}
                          shadowOffsetY={12}
                          shadowOpacity={0.55}
                        />
                        <Text
                          x={28}
                          y={24}
                          width={344}
                          text={titleText}
                          fontSize={22}
                          fontStyle="bold"
                          fontFamily="Inter, system-ui, sans-serif"
                          fill={THEME.accent}
                        />
                        {storyStats.map((key, i) => (
                          <Group key={key} x={28} y={64 + i * 72}>
                            <StatIcon
                              kind={key}
                              x={0}
                              y={6}
                              strokeColor={THEME.accent}
                            />
                            <Text
                              x={40}
                              y={0}
                              width={300}
                              text={key.replace(/([A-Z])/g, " $1").trim()}
                              fontSize={STAT_LABEL_PX}
                              fontStyle="bold"
                              fontFamily="Inter, system-ui, sans-serif"
                              fill={THEME.muted}
                              letterSpacing={0.8}
                            />
                            <Text
                              x={40}
                              y={28}
                              width={300}
                              text={statValues[key]}
                              fontSize={STAT_VALUE_PX}
                              fontStyle="bold"
                              fontFamily="Inter, system-ui, sans-serif"
                              fill={valueColor(key)}
                            />
                          </Group>
                        ))}
                      </Group>
                    ) : null}

                    {presetId === "darkCard" ? (
                      <Group
                        x={positions.darkCard.x}
                        y={positions.darkCard.y}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(
                            pos,
                            DARK_CARD_W,
                            darkCardH,
                            CANVAS_W,
                            canvasH
                          )
                        }
                        onDragEnd={(e) =>
                          setPositions((p) => ({
                            ...p,
                            darkCard: {
                              x: e.target.x(),
                              y: e.target.y(),
                            },
                          }))
                        }
                      >
                        <Rect
                          width={DARK_CARD_W}
                          height={darkCardH}
                          cornerRadius={28}
                          fill="rgba(12,12,14,0.88)"
                          stroke={THEME.glassStroke}
                          strokeWidth={1}
                          shadowColor="rgba(0,0,0,0.6)"
                          shadowBlur={40}
                          shadowOffsetY={16}
                          shadowOpacity={0.6}
                        />
                        {STAT_ORDER.filter((k) => layers[k]).map((key, i) => {
                          const cols = 3;
                          const col = i % cols;
                          const row = Math.floor(i / cols);
                          const cellW = (DARK_CARD_W - 80) / cols;
                          const cx = 40 + col * cellW;
                          const cy = 40 + row * 110;
                          return (
                            <Group key={key} x={cx} y={cy}>
                              {statLabel(
                                key === "avgSpeed"
                                  ? "AVG SPD"
                                  : key === "heartRate"
                                    ? "HEART"
                                    : key.toUpperCase(),
                                0,
                                0,
                                cellW - 8
                              )}
                              <Text
                                x={0}
                                y={22}
                                width={cellW - 8}
                                text={statValues[key]}
                                fontSize={STAT_VALUE_PX}
                                fontStyle="bold"
                                fontFamily="Inter, system-ui, sans-serif"
                                fill={valueColor(key)}
                              />
                            </Group>
                          );
                        })}
                      </Group>
                    ) : null}

                    {showClassicMap ? (
                      <Group
                        x={positions.map.x}
                        y={positions.map.y}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(
                            pos,
                            MAP_CARD_W,
                            MAP_CARD_H,
                            CANVAS_W,
                            canvasH
                          )
                        }
                        onDragEnd={(e) =>
                          setPositions((p) => ({
                            ...p,
                            map: { x: e.target.x(), y: e.target.y() },
                          }))
                        }
                      >
                        <Rect
                          width={MAP_CARD_W}
                          height={MAP_CARD_H}
                          cornerRadius={20}
                          fill={THEME.glassFill}
                          stroke={THEME.glassStroke}
                          strokeWidth={1}
                          shadowColor="rgba(0,0,0,0.55)"
                          shadowBlur={28}
                          shadowOffsetY={10}
                          shadowOpacity={0.55}
                        />
                        <Text
                          x={MAP_PAD_X}
                          y={12}
                          text="ROUTE"
                          fontSize={STAT_LABEL_PX}
                          fontStyle="bold"
                          fontFamily="Inter, system-ui, sans-serif"
                          fill={THEME.muted}
                          letterSpacing={2}
                        />
                        <Group
                          x={MAP_PAD_X}
                          y={MAP_HEADER_H}
                          clipFunc={(ctx) => {
                            ctx.beginPath();
                            ctx.roundRect(0, 0, ROUTE_BASE_W, ROUTE_BASE_H, 12);
                          }}
                        >
                          <Rect
                            x={0}
                            y={0}
                            width={ROUTE_BASE_W}
                            height={ROUTE_BASE_H}
                            fill="rgba(255,255,255,0.04)"
                          />
                          {hasRouteDefault ? (
                            <Line
                              points={routePointsDefault}
                              stroke={THEME.highlight}
                              strokeWidth={4}
                              lineCap="round"
                              lineJoin="round"
                              shadowColor="rgba(232,255,0,0.35)"
                              shadowBlur={12}
                              shadowOpacity={0.9}
                            />
                          ) : (
                            <Text
                              x={0}
                              y={ROUTE_BASE_H / 2 - 12}
                              width={ROUTE_BASE_W}
                              align="center"
                              text="No GPS track"
                              fontSize={14}
                              fontStyle="bold"
                              fontFamily="Inter, system-ui, sans-serif"
                              fill={THEME.muted}
                            />
                          )}
                        </Group>
                      </Group>
                    ) : null}
                  </Layer>
                </Stage>
              </div>
            </div>
          </div>

          <p className="shrink-0 text-center text-[11px] font-medium text-[#F5F5F5]/40 sm:text-xs">
            Route from Strava <code className="font-mono text-[#E8FF00]/80">summary_polyline</code> ·{" "}
            <span className="font-mono">
              {appUrl ? new URL(appUrl).hostname : "unset"}
            </span>
          </p>
        </div>
      </div>

      {layersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close layers"
            onClick={() => setLayersOpen(false)}
          />
          <div
            className="glass-panel absolute bottom-0 left-0 right-0 max-h-[85dvh] overflow-hidden rounded-t-3xl border-[#F5F5F5]/12 shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="layers-sheet-title"
          >
            <div className="flex items-center justify-between border-b border-[#F5F5F5]/10 px-4 py-3">
              <h2
                id="layers-sheet-title"
                className="text-base font-bold text-[#F5F5F5]"
              >
                Layers & stats
              </h2>
              <button
                type="button"
                onClick={() => setLayersOpen(false)}
                className="min-h-11 min-w-11 rounded-full text-sm font-bold text-[#E8FF00]"
              >
                Done
              </button>
            </div>
            <div className="max-h-[calc(85dvh-3.5rem)] space-y-4 overflow-y-auto p-4">
              <LayersPanel
                layers={layers}
                toggle={toggle}
                setAllStats={setAllStats}
                checkClass={checkClass}
                labelClass={labelClass}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
