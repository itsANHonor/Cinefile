import React, { useEffect, useRef, useState, useCallback } from 'react';
import { decodeBarcodesFromImageData } from '../lib/barcodeDecoder';
import { Button } from './ui/Button';

export interface BarcodeCameraScannerProps {
  onBarcodeDetected: (code: string) => void;
  onSwitchToPhotos?: () => void;
}

const SCAN_INTERVAL_MS = 280;
const DUPLICATE_COOLDOWN_MS = 2500;

function playBeep(): void {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1046.5; // C6 crisp scanner chime
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 200);
  } catch {
    // Audio playback may be blocked until user gesture
  }
}

const BarcodeCameraScanner: React.FC<BarcodeCameraScannerProps> = ({
  onBarcodeDetected,
  onSwitchToPhotos,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const isDecodingRef = useRef(false);
  const recentCodesRef = useRef<Map<string, number>>(new Map());
  const onDetectedRef = useRef(onBarcodeDetected);
  onDetectedRef.current = onBarcodeDetected;

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [status, setStatus] = useState<'initializing' | 'active' | 'unsupported' | 'error'>('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const isSecureContextAvailable =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!isSecureContextAvailable) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      stopCamera();
      setStatus('initializing');
      setErrorMessage('');

      try {
        const videoConstraints: MediaTrackConstraints = selectedDeviceId
          ? {
              deviceId: { exact: selectedDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Populate device switcher once permission is granted
        if (navigator.mediaDevices.enumerateDevices) {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
          if (!cancelled) {
            setDevices(videoInputs);
            if (!selectedDeviceId && videoInputs.length > 0) {
              const activeTrackId = stream.getVideoTracks()[0]?.getSettings()?.deviceId;
              if (activeTrackId) {
                setSelectedDeviceId(activeTrackId);
              }
            }
          }
        }

        if (!cancelled) {
          setStatus('active');
        }

        // Start throttled frame decode loop
        scanTimerRef.current = window.setInterval(async () => {
          if (cancelled || isDecodingRef.current) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
            return;
          }

          isDecodingRef.current = true;
          try {
            let canvas = canvasRef.current;
            if (!canvas) {
              canvas = document.createElement('canvas');
              canvasRef.current = canvas;
            }
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const decoded = await decodeBarcodesFromImageData(imageData);

            const now = Date.now();
            for (const item of decoded) {
              const lastSeen = recentCodesRef.current.get(item.code) ?? 0;
              if (now - lastSeen < DUPLICATE_COOLDOWN_MS) continue;
              recentCodesRef.current.set(item.code, now);

              if (!cancelled) {
                setLastScanned(item.code);
                if (soundEnabledRef.current) {
                  playBeep();
                }
                onDetectedRef.current(item.code);
              }
            }
          } catch {
            // Frame decode errors are transient; keep scanning
          } finally {
            isDecodingRef.current = false;
          }
        }, SCAN_INTERVAL_MS);
      } catch (err: any) {
        if (cancelled) return;
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setErrorMessage('Camera permission was denied. Allow camera access in your browser or OS settings, or upload photos instead.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setErrorMessage('No camera was detected on this device. Use the Photos or Manual tab instead.');
        } else {
          setErrorMessage(err?.message || 'Unable to start camera.');
        }
        setStatus('error');
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isSecureContextAvailable, selectedDeviceId, stopCamera]);

  if (status === 'unsupported') {
    const isPlainHttp = typeof window !== 'undefined' && window.location.protocol === 'http:';
    return (
      <div className="rounded-[--radius-card] border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-900/15 p-5 text-center space-y-3">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-content">
            Live camera requires HTTPS or localhost
          </h4>
          <p className="text-xs text-content-muted max-w-md mx-auto">
            {isPlainHttp
              ? 'Browsers block live camera access over plain HTTP on network IPs. You can either access Cinefile over HTTPS / localhost, or use the Photos tab to snap or select barcode photos directly.'
              : 'Live camera scanning is not supported in this browser. Use the Photos tab to upload or capture barcode photos instead.'}
          </p>
        </div>
        {onSwitchToPhotos && (
          <Button variant="secondary" size="sm" onClick={onSwitchToPhotos}>
            Switch to Photos
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[--radius-card] border border-subtle bg-black aspect-video max-h-80 w-full flex items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />

        {/* Scanning reticle overlay */}
        {status === 'active' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-xs h-28 rounded-lg border-2 border-primary-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] relative">
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 animate-pulse" />
            </div>
            <span className="mt-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
              Center a UPC / EAN barcode inside the frame
            </span>
          </div>
        )}

        {status === 'initializing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm">
            Starting camera…
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-5 text-center space-y-3">
            <p className="text-sm text-white max-w-md">{errorMessage}</p>
            {onSwitchToPhotos && (
              <Button variant="secondary" size="sm" onClick={onSwitchToPhotos}>
                Use Photos Instead
              </Button>
            )}
          </div>
        )}

        {lastScanned && status === 'active' && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-3 left-3 rounded-full bg-green-600/95 px-3 py-1 text-xs font-semibold text-white shadow"
          >
            Scanned {lastScanned}
          </div>
        )}
      </div>

      {/* Camera controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {devices.length > 1 && (
            <select
              aria-label="Select camera"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-subtle rounded-[--radius-control] bg-surface text-content"
            >
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          )}
          <span className="text-content-muted">
            Keep scanning to queue multiple discs at once.
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSoundEnabled((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-[--radius-control] border border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-content-muted hover:text-content"
        >
          {soundEnabled ? 'Beep: On' : 'Beep: Off'}
        </button>
      </div>
    </div>
  );
};

export default BarcodeCameraScanner;
