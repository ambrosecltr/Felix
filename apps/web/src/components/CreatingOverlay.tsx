import { useEffect, useState } from "react";

const STEPS = [
  "Getting your workspace ready…",
  "Setting up your app…",
  "Installing the building blocks…",
  "Starting things up…",
  "Almost there…",
];

export function CreatingOverlay() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/80 backdrop-blur-sm">
      <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <div className="text-sm text-muted-foreground">{STEPS[step]}</div>
    </div>
  );
}
