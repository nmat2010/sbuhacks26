import { useRef, useEffect, useState } from 'react';
import './Camera.css';

interface CameraProps {
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
}

export function Camera({ onCapture, onClose }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // Use back camera on mobile
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        setStream(mediaStream);
      } catch (err) {
        console.error('[Camera] Failed to access camera:', err);
        setError('Could not access camera. Please grant camera permission.');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0);

    setCaptured(true);
  };

  const handleRetake = () => {
    setCaptured(false);
  };

  const handleUse = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onCapture(imageDataUrl);

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    onClose();
  };

  return (
    <div className="camera-modal">
      <div className="camera-container">
        <div className="camera-header">
          <h2>Take Photo</h2>
          <button className="close-btn" onClick={handleClose}>✕</button>
        </div>

        {error ? (
          <div className="camera-error">
            <p>{error}</p>
            <button className="btn btn-primary" onClick={handleClose}>Close</button>
          </div>
        ) : (
          <>
            <div className="camera-viewport">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className={captured ? 'hidden' : ''}
              />
              <canvas
                ref={canvasRef}
                className={captured ? '' : 'hidden'}
              />
            </div>

            <div className="camera-controls">
              {!captured ? (
                <button className="btn btn-capture" onClick={handleCapture}>
                  📷 Capture
                </button>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={handleRetake}>
                    🔄 Retake
                  </button>
                  <button className="btn btn-primary" onClick={handleUse}>
                    ✓ Use Photo
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
