import { useCallback, useEffect, useState, type RefObject } from 'react';

export function useVideoPlayback(video: RefObject<HTMLVideoElement | null>, stream: MediaStream | null) {
  const [feedback, setFeedback] = useState<'paused' | 'unsupported' | null>(null);
  const [resolution, setResolution] = useState('');

  const play = useCallback(() => {
    const element = video.current;
    const currentStream = element?.srcObject;
    if (!element || !currentStream) return;
    void element.play()?.then(() => {
      if (element.srcObject === currentStream) setFeedback(null);
    }).catch(error => {
      if (element.srcObject !== currentStream) return;
      setFeedback(error?.name === 'NotAllowedError' ? 'paused' : 'unsupported');
    });
  }, [video]);

  const updateResolution = useCallback(() => {
    const element = video.current;
    if (element?.videoWidth && element.videoHeight) {
      setResolution(`${element.videoWidth} × ${element.videoHeight}`);
    }
  }, [video]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    setFeedback(null);
    setResolution('');
    if (!stream) return;

    element.srcObject = stream;
    play();
    return () => {
      element.srcObject = null;
    };
  }, [video, stream, play]);

  return { feedback, resolution, play, updateResolution };
}
