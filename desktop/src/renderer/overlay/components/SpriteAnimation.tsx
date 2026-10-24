import { useEffect, useRef, useState } from 'react';

interface SpriteAnimationProps {
  /** Path to the sprite sheet image */
  src: string;
  /** Number of frames in the sprite sheet (horizontal) */
  frames: number;
  /** Frames per second */
  fps?: number;
  /** Whether to loop the animation */
  loop?: boolean;
  /** Size to display (width and height) */
  size?: number;
  /** Called when animation completes (if not looping) */
  onComplete?: () => void;
  /** CSS class name */
  className?: string;
}

export function SpriteAnimation({
  src,
  frames,
  fps = 8,
  loop = true,
  size = 200,
  onComplete,
  className = ''
}: SpriteAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameIndexRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Load the sprite sheet
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load sprite sheet:', src);
    };
    img.src = src;

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [src]);

  // Animate the sprite
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;
    const frameWidth = img.width / frames;
    const frameHeight = img.height;
    const frameDuration = 1000 / fps; // milliseconds per frame

    const animate = (timestamp: number) => {
      // Calculate if enough time has passed for next frame
      if (timestamp - lastFrameTimeRef.current >= frameDuration) {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw current frame
        const frameX = frameIndexRef.current * frameWidth;
        ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
        ctx.drawImage(
          img,
          frameX, 0,           // source x, y
          frameWidth, frameHeight, // source width, height
          0, 0,                // dest x, y
          canvas.width, canvas.height // dest width, height
        );

        // Move to next frame
        frameIndexRef.current++;

        // Handle loop/completion
        if (frameIndexRef.current >= frames) {
          if (loop) {
            frameIndexRef.current = 0;
          } else {
            frameIndexRef.current = frames - 1; // Stay on last frame
            onComplete?.();
            return; // Stop animation
          }
        }

        lastFrameTimeRef.current = timestamp;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [imageLoaded, frames, fps, loop, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated'
      }}
    />
  );
}
