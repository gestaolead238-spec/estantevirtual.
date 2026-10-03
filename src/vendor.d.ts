interface Html5Qrcode {
  start(
    camera: { facingMode: 'environment' },
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError?: (error: string) => void,
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

interface Window {
  Html5Qrcode?: new (elementId: string) => Html5Qrcode;
}
