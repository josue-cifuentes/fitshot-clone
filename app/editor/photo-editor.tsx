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
  Transformer,
} from "react-konva";
import type { Group as KonvaGroup } from "konva/lib/Group";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Transformer as KonvaTransformer } from "konva/lib/shapes/Transformer";
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
  exportFormatForPreset,
  layersForPreset,
  mapScaleForPreset,
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

const STORY_BASE_H = STORY_H;
const DEFAULT_STAT_VALUE_STORY = 36;
const DEFAULT_STAT_LABEL_STORY = 13;
const TITLE_STORY_PX = 28;
const DATE_STORY_PX = 16;
const NOTCH_PAD_STORY = 72;

const TOP_W = CANVAS_W - 56;
const TOP_H = 168;
const MAP_CARD_W = 302;
const MAP_CARD_H = 218;
const MAP_PAD_X = 16;

const STAT_ORDER: StatKey[] = [
  "distance",
  "duration",
  "avgSpeed",
  "maxSpeed",
  "heartRate",
  "elevation",
  "calories",
];

const STAT_ICONS: Record<StatKey, { d: string; fill?: string }> = {
  distance: { d: "M3 19.5h18M6.5 15.5L12 8l5.5 7.5" },
  duration: { d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-12v5l3 2" },
  avgSpeed: { d: "M4 17L13 8l3 3-7 7M16 11l4-4" },
  maxSpeed: { d: "M13 3 3 13M9 21l10-10M17 7l4 4" },
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

type OverlayId = "header" | "map" | "stack";

type EditorPositions = {
  header: { x: number; y: number };
  map: { x: number; y: number };
  stack: { x: number; y: number };
};

type OverlayScale = { scaleX: number; scaleY: number };

function initialPositions(preset: PresetId, canvasH: number): EditorPositions {
  const cScale = canvasH / STORY_BASE_H;
  const mapScale = mapScaleForPreset(preset);
  const mw = MAP_CARD_W * mapScale;
  const mh = MAP_CARD_H * mapScale;

  const headerBase = {
    x: Math.round(28 * cScale),
    y: Math.round(NOTCH_PAD_STORY * cScale),
  };
  const mapTopRight = {
    x: CANVAS_W - mw - Math.round(28 * cScale),
    y: Math.round(88 * cScale),
  };
  const stackDefault = {
    x: Math.round(32 * cScale),
    y: canvasH * 0.75,
  };

  switch (preset) {
    case "minimal":
      return {
        header: headerBase,
        map: mapTopRight,
        stack: {
          x: Math.round(32 * cScale),
          y: canvasH * 0.82,
        },
      };
    case "mapFocus":
      return {
        header: {
          x: Math.round(28 * cScale),
          y: Math.round((NOTCH_PAD_STORY - 8) * cScale),
        },
        map: {
          x: Math.round(20 * cScale),
          y: Math.round(canvasH * 0.2),
        },
        stack: {
          x: Math.round(32 * cScale),
          y: Math.min(canvasH * 0.68, canvasH - mh - Math.round(48 * cScale)),
        },
      };
    case "darkCard":
      return {
        header: headerBase,
        map: mapTopRight,
        stack: {
          x: Math.round(28 * cScale),
          y: canvasH * 0.72,
        },
      };
    case "storyMode":
    case "full":
    default:
      return {
        header: headerBase,
        map: mapTopRight,
        stack: stackDefault,
      };
  }
}

function initialOverlayScales(): Record<OverlayId, OverlayScale> {
  return {
    header: { scaleX: 1, scaleY: 1 },
    map: { scaleX: 1, scaleY: 1 },
    stack: { scaleX: 1, scaleY: 1 },
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

const CHIP_STATS: { key: StatKey; label: string }[] = [
  { key: "distance", label: "Distance" },
  { key: "duration", label: "Duration" },
  { key: "avgSpeed", label: "Avg speed" },
  { key: "maxSpeed", label: "Max speed" },
  { key: "heartRate", label: "Heart rate" },
  { key: "elevation", label: "Elevation" },
  { key: "calories", label: "Calories" },
];

function chipClass(on: boolean): string {
  return `rounded-full border px-3 py-2 text-left text-xs font-bold transition ${
    on
      ? "border-[#E8FF00] bg-[#0A0A0A] text-[#E8FF00] shadow-[0_0_0_1px_rgba(232,255,0,0.25)]"
      : "border-[#F5F5F5]/15 bg-[#F5F5F5]/[0.04] text-[#F5F5F5]/35"
  }`;
}

function EditorSidebarPanel({
  layers,
  toggle,
  setAllStats,
  statValuePx,
  setStatValuePx,
}: {
  layers: LayerToggles;
  toggle: (key: keyof LayerToggles) => void;
  setAllStats: (on: boolean) => void;
  statValuePx: number;
  setStatValuePx: (n: number) => void;
}) {
  return (
    <>
      <div>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#F5F5F5]/45">
          Overlays
        </h2>
        <p className="mt-1 text-xs text-[#F5F5F5]/40">
          Tap chips to show or hide. Tap canvas groups to resize with handles.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-[#F5F5F5]/45">
          Stat value size ({statValuePx}px)
        </label>
        <input
          type="range"
          min={12}
          max={48}
          value={statValuePx}
          onChange={(e) => setStatValuePx(Number(e.target.value))}
          className="w-full accent-[#E8FF00]"
        />
      </div>

      <div className="border-t border-[#F5F5F5]/10 pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#F5F5F5]/45">
            On canvas
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setAllStats(true)}
              className="rounded-md px-2 py-1 text-[11px] font-bold text-[#E8FF00] hover:bg-[#E8FF00]/10"
            >
              All stats
            </button>
            <button
              type="button"
              onClick={() => setAllStats(false)}
              className="rounded-md px-2 py-1 text-[11px] font-bold text-[#F5F5F5]/40 hover:bg-[#F5F5F5]/5"
            >
              None
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => toggle("topBar")}
            className={chipClass(layers.topBar)}
          >
            Header · title &amp; date
          </button>
          <button
            type="button"
            onClick={() => toggle("map")}
            className={chipClass(layers.map)}
          >
            Route map
          </button>
          {CHIP_STATS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={chipClass(layers[key])}
            >
              {label}
            </button>
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
  const transformerRef = useRef<KonvaTransformer | null>(null);
  const headerGroupRef = useRef<KonvaGroup | null>(null);
  const mapGroupRef = useRef<KonvaGroup | null>(null);
  const stackGroupRef = useRef<KonvaGroup | null>(null);
  const pinchStart = useRef<{
    dist: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);

  const [presetId, setPresetId] = useState<PresetId>("full");
  const [layoutTransition, setLayoutTransition] = useState(false);

  const [exportFormat, setExportFormat] = useState<ExportFormat>("story");
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

  const [statValuePx, setStatValuePx] = useState(DEFAULT_STAT_VALUE_STORY);
  const [selectedOverlay, setSelectedOverlay] = useState<OverlayId | null>(null);
  const [overlayScales, setOverlayScales] = useState<Record<OverlayId, OverlayScale>>(
    () => initialOverlayScales()
  );

  const [positions, setPositions] = useState<EditorPositions>(() =>
    initialPositions("full", STORY_H)
  );

  const applyPreset = useCallback((id: PresetId) => {
    const format = exportFormatForPreset(id);
    const h = format === "story" ? STORY_H : FEED_H;
    setPresetId(id);
    setExportFormat(format);
    setLayers(layersForPreset(id));
    setOverlayScales(initialOverlayScales());
    setSelectedOverlay(null);
    setPositions(initialPositions(id, h));
  }, []);

  const presetSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleSelectPreset = useCallback(
    (id: PresetId) => {
      if (id === presetId) return;
      if (presetSwitchTimerRef.current !== null) {
        clearTimeout(presetSwitchTimerRef.current);
        presetSwitchTimerRef.current = null;
      }
      setLayoutTransition(true);
      applyPreset(id);
      presetSwitchTimerRef.current = setTimeout(() => {
        presetSwitchTimerRef.current = null;
        setLayoutTransition(false);
      }, 120);
    },
    [applyPreset, presetId]
  );

  const setExportFormatAndReset = useCallback(
    (f: ExportFormat) => {
      setExportFormat(f);
      const h = f === "feed" ? FEED_H : STORY_H;
      setPositions(initialPositions(presetId, h));
      setOverlayScales(initialOverlayScales());
      setSelectedOverlay(null);
    },
    [presetId]
  );

  useEffect(() => {
    return () => {
      if (presetSwitchTimerRef.current !== null) {
        clearTimeout(presetSwitchTimerRef.current);
      }
    };
  }, []);

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

  const canvasScale = canvasH / STORY_BASE_H;
  const effectiveValuePx = Math.max(
    10,
    Math.round(statValuePx * canvasScale)
  );
  const effectiveLabelPx = Math.max(
    8,
    Math.round((DEFAULT_STAT_LABEL_STORY * (statValuePx / DEFAULT_STAT_VALUE_STORY)) * canvasScale)
  );
  const titlePx = Math.max(14, Math.round(TITLE_STORY_PX * canvasScale));
  const datePx = Math.max(10, Math.round(DATE_STORY_PX * canvasScale));

  const mapBaseW = MAP_CARD_W * mapScaleForPreset(presetId);
  const mapBaseH = MAP_CARD_H * mapScaleForPreset(presetId);
  const routeW = mapBaseW - MAP_PAD_X * 2;
  const routeH = mapBaseH - MAP_PAD_X * 2;

  const routePoints = useMemo(() => {
    const encoded = selected?.map?.summary_polyline;
    return summaryPolylineToFlatPoints(encoded, routeW, routeH, 4);
  }, [selected, routeW, routeH]);

  const hasRoute = routePoints.length >= 4;

  const statValues = useMemo(() => {
    if (!selected) {
      return {
        distance: "—",
        duration: "—",
        avgSpeed: "—",
        maxSpeed: "—",
        heartRate: "—",
        elevation: "—",
        calories: "—",
      } as Record<StatKey, string>;
    }
    return {
      distance: formatDistanceMeters(selected.distance),
      duration: formatDuration(selected.moving_time),
      avgSpeed: formatSpeedMps(selected.average_speed),
      maxSpeed: formatSpeedMps(selected.max_speed),
      heartRate: showHr
        ? formatHeartRate(selected.average_heartrate ?? undefined)
        : "—",
      elevation: formatElevationMeters(selected.total_elevation_gain),
      calories: formatCalories(selected.calories ?? undefined),
    };
  }, [selected, showHr]);

  const visibleStats = STAT_ORDER.filter((k) => layers[k]);
  const showStatStack = visibleStats.length > 0;
  const stackRowH = effectiveValuePx + effectiveLabelPx + Math.round(28 * canvasScale);
  const stackPad = Math.round(28 * canvasScale);
  const stackInnerW = CANVAS_W - Math.round(64 * canvasScale);
  const stackPanelH = showStatStack
    ? stackPad * 2 + visibleStats.length * stackRowH + Math.round(8 * canvasScale)
    : 0;
  const stackMaxY = canvasH - Math.round(120 * canvasScale);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const map: Record<OverlayId, KonvaGroup | null> = {
      header: headerGroupRef.current,
      map: mapGroupRef.current,
      stack: stackGroupRef.current,
    };
    const node = selectedOverlay ? map[selectedOverlay] : null;
    if (node) {
      tr.nodes([node]);
      tr.moveToTop();
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedOverlay, showStatStack, canvasH]);

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
    transformerRef.current?.hide();
    try {
      return await stageToBlob(stage);
    } finally {
      transformerRef.current?.show();
      stage.batchDraw();
    }
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
      maxSpeed: on,
      heartRate: on,
      elevation: on,
      calories: on,
    }));
  }, []);

  const previewW = CANVAS_W * viewScale;
  const previewH = canvasH * viewScale;

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

  const mediaSource = photo ?? videoEl ?? undefined;

  const stackGlassFill =
    presetId === "darkCard"
      ? "rgba(10,10,12,0.88)"
      : THEME.glassFill;

  const bindTransformEnd = useCallback((id: OverlayId) => {
    return (e: KonvaEventObject<Event>) => {
      const t = e.target as KonvaGroup;
      setOverlayScales((p) => ({
        ...p,
        [id]: { scaleX: t.scaleX(), scaleY: t.scaleY() },
      }));
    };
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 font-[family-name:var(--font-inter)] sm:gap-4 lg:max-w-6xl">
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
        <aside className="glass-panel hidden w-72 shrink-0 space-y-4 rounded-2xl p-4 lg:block">
          <EditorSidebarPanel
            layers={layers}
            toggle={toggle}
            setAllStats={setAllStats}
            statValuePx={statValuePx}
            setStatValuePx={setStatValuePx}
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
                  onClick={() => setExportFormatAndReset("story")}
                  className={`min-h-11 flex-1 rounded-xl px-3 text-xs font-extrabold transition sm:min-h-9 sm:rounded-full sm:px-4 sm:text-sm ${
                    exportFormat === "story"
                      ? "bg-[#E8FF00] text-[#0A0A0A] shadow-md"
                      : "text-[#F5F5F5]/50"
                  }`}
                >
                  Story 9:16
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormatAndReset("feed")}
                  className={`min-h-11 flex-1 rounded-xl px-3 text-xs font-extrabold transition sm:min-h-9 sm:rounded-full sm:px-4 sm:text-sm ${
                    exportFormat === "feed"
                      ? "bg-[#E8FF00] text-[#0A0A0A] shadow-md"
                      : "text-[#F5F5F5]/50"
                  }`}
                >
                  Feed 1:1
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
                <Stage
                  width={CANVAS_W}
                  height={canvasH}
                  ref={stageRef}
                  onMouseDown={(e) => {
                    const st = e.target.getStage();
                    if (st && e.target === st) setSelectedOverlay(null);
                  }}
                >
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

                    {layers.topBar ? (
                      <Group
                        ref={headerGroupRef}
                        x={positions.header.x}
                        y={positions.header.y}
                        scaleX={overlayScales.header.scaleX}
                        scaleY={overlayScales.header.scaleY}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(pos, TOP_W, TOP_H, CANVAS_W, canvasH)
                        }
                        onDragEnd={(e) =>
                          setPositions((p) => ({
                            ...p,
                            header: { x: e.target.x(), y: e.target.y() },
                          }))
                        }
                        onMouseDown={(e) => {
                          e.cancelBubble = true;
                          setSelectedOverlay("header");
                        }}
                        onTransformEnd={bindTransformEnd("header")}
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
                          fontSize={titlePx}
                          fontStyle="bold"
                          fontFamily="Inter, system-ui, sans-serif"
                          fill={THEME.accent}
                          letterSpacing={-0.5}
                          lineHeight={1.15}
                        />
                        {dateText ? (
                          <Text
                            x={28}
                            y={28 + titlePx + 12}
                            width={TOP_W - 56}
                            text={dateText}
                            fontSize={datePx}
                            fontStyle="normal"
                            fontFamily="Inter, system-ui, sans-serif"
                            fill={THEME.muted}
                            letterSpacing={0.2}
                          />
                        ) : null}
                      </Group>
                    ) : null}

                    {layers.map ? (
                      <Group
                        ref={mapGroupRef}
                        x={positions.map.x}
                        y={positions.map.y}
                        scaleX={overlayScales.map.scaleX}
                        scaleY={overlayScales.map.scaleY}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(
                            pos,
                            mapBaseW,
                            mapBaseH,
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
                        onMouseDown={(e) => {
                          e.cancelBubble = true;
                          setSelectedOverlay("map");
                        }}
                        onTransformEnd={bindTransformEnd("map")}
                      >
                        <Rect
                          width={mapBaseW}
                          height={mapBaseH}
                          cornerRadius={22}
                          fill={THEME.glassFill}
                          stroke={THEME.glassStroke}
                          strokeWidth={1}
                          shadowColor="rgba(0,0,0,0.55)"
                          shadowBlur={28}
                          shadowOffsetY={12}
                          shadowOpacity={0.55}
                        />
                        <Group
                          x={MAP_PAD_X}
                          y={MAP_PAD_X}
                          clipFunc={(ctx) => {
                            ctx.beginPath();
                            ctx.roundRect(0, 0, routeW, routeH, 14);
                          }}
                        >
                          <Rect
                            x={0}
                            y={0}
                            width={routeW}
                            height={routeH}
                            fill="rgba(255,255,255,0.04)"
                          />
                          {hasRoute ? (
                            <Line
                              points={routePoints}
                              stroke={THEME.highlight}
                              strokeWidth={Math.max(3, Math.round(4 * canvasScale))}
                              lineCap="round"
                              lineJoin="round"
                              shadowColor="rgba(232,255,0,0.35)"
                              shadowBlur={12}
                              shadowOpacity={0.9}
                            />
                          ) : null}
                        </Group>
                      </Group>
                    ) : null}

                    {showStatStack ? (
                      <Group
                        ref={stackGroupRef}
                        x={positions.stack.x}
                        y={positions.stack.y}
                        scaleX={overlayScales.stack.scaleX}
                        scaleY={overlayScales.stack.scaleY}
                        draggable
                        dragBoundFunc={(pos) =>
                          clampOverlay(
                            pos,
                            stackInnerW,
                            Math.min(stackPanelH, stackMaxY - positions.stack.y),
                            CANVAS_W,
                            canvasH
                          )
                        }
                        onDragEnd={(e) =>
                          setPositions((p) => ({
                            ...p,
                            stack: { x: e.target.x(), y: e.target.y() },
                          }))
                        }
                        onMouseDown={(e) => {
                          e.cancelBubble = true;
                          setSelectedOverlay("stack");
                        }}
                        onTransformEnd={bindTransformEnd("stack")}
                      >
                        <Rect
                          x={0}
                          y={0}
                          width={stackInnerW}
                          height={Math.min(stackPanelH, stackMaxY - positions.stack.y)}
                          cornerRadius={24}
                          fill={stackGlassFill}
                          stroke={THEME.glassStroke}
                          strokeWidth={1}
                          shadowColor="rgba(0,0,0,0.5)"
                          shadowBlur={32}
                          shadowOffsetY={12}
                          shadowOpacity={0.55}
                        />
                        {visibleStats.map((key, i) => {
                          const rowY =
                            stackPad + i * stackRowH + Math.round(4 * canvasScale);
                          const lbl =
                            CHIP_STATS.find((c) => c.key === key)?.label ??
                            key.toUpperCase();
                          const iconS = Math.min(
                            1.35,
                            effectiveValuePx / 26
                          );
                          const labelCol = Math.round(44 * canvasScale);
                          return (
                            <Group key={key} x={stackPad} y={rowY}>
                              <Group
                                x={0}
                                y={Math.round(4 * canvasScale)}
                                scaleX={iconS}
                                scaleY={iconS}
                              >
                                <StatIcon
                                  kind={key}
                                  x={0}
                                  y={0}
                                  strokeColor={THEME.accent}
                                />
                              </Group>
                              <Text
                                x={labelCol}
                                y={0}
                                width={stackInnerW - stackPad * 2 - labelCol}
                                text={lbl.toUpperCase()}
                                fontSize={effectiveLabelPx}
                                fontStyle="bold"
                                fontFamily="Inter, system-ui, sans-serif"
                                fill={THEME.muted}
                                letterSpacing={2.2}
                              />
                              <Text
                                x={labelCol}
                                y={effectiveLabelPx + Math.round(8 * canvasScale)}
                                width={stackInnerW - stackPad * 2 - labelCol}
                                text={statValues[key]}
                                fontSize={effectiveValuePx}
                                fontStyle="bold"
                                fontFamily="Inter, system-ui, sans-serif"
                                fill={valueColor(key)}
                              />
                            </Group>
                          );
                        })}
                      </Group>
                    ) : null}

                    <Transformer
                      ref={transformerRef}
                      rotateEnabled={false}
                      flipEnabled={false}
                      borderStroke="#E8FF00"
                      anchorFill="#0A0A0A"
                      anchorStroke="#E8FF00"
                      anchorSize={11}
                      padding={8}
                      boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 36 || newBox.height < 22)
                          return oldBox;
                        return newBox;
                      }}
                    />
                  </Layer>
                </Stage>
              </div>
            </div>
          </div>
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
              <EditorSidebarPanel
                layers={layers}
                toggle={toggle}
                setAllStats={setAllStats}
                statValuePx={statValuePx}
                setStatValuePx={setStatValuePx}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
