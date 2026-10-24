import { useEffect, useState } from 'react';

/** Whole seconds counting down to 0 (e.g. an OTP resend cooldown). Call `start(n)` to (re)start. */
export function useCountdown(): [seconds: number, start: (seconds: number) => void] {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return [seconds, setSeconds];
}
