import React, { forwardRef } from 'react';
import { ImageFrame } from '../types';
import { getFramedImageStyle, normalizeImageFrame } from '../lib/imageFrame';

export interface FramedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  frame?: ImageFrame | null;
  /**
   * Render a blurred ambient copy of the photo behind 'fit' images so wide
   * box sets letterbox over a themed backdrop instead of empty space.
   */
  ambientBackdrop?: boolean;
}

const FramedImage = forwardRef<HTMLImageElement, FramedImageProps>(
  ({ frame, ambientBackdrop = true, className, style, src, alt, ...rest }, ref) => {
    const normalized = normalizeImageFrame(frame);
    const showBackdrop = ambientBackdrop && normalized.fit === 'fit' && Boolean(src);
    return (
      <>
        {showBackdrop && (
          <img
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl saturate-150"
          />
        )}
        <img
          ref={ref}
          src={src}
          alt={alt}
          className={`${showBackdrop ? 'relative ' : ''}${className ?? ''}`}
          style={{ ...getFramedImageStyle(frame), ...style }}
          {...rest}
        />
      </>
    );
  }
);

FramedImage.displayName = 'FramedImage';

export default FramedImage;
