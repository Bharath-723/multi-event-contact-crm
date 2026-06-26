'use client';

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { X, Download, Printer, Copy, Check, Loader2, QrCode, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QRModal({ isOpen, onClose }: QRModalProps) {
  const [appUrlEnv, setAppUrlEnv] = useState<string>('');
  const [currentUrlInput, setCurrentUrlInput] = useState<string>('');
  const [qrPngUrl, setQrPngUrl] = useState('');
  const [qrSvgString, setQrSvgString] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const generateQRCodes = async (url: string) => {
    if (!url) {
      setQrPngUrl('');
      setQrSvgString('');
      return;
    }
    try {
      setIsLoading(true);
      // Generate PNG data URL
      const png = await QRCode.toDataURL(url, {
        width: 512,
        margin: 2,
        color: {
          dark: '#1e1b4b', // Deep indigo
          light: '#ffffff'
        }
      });
      setQrPngUrl(png);

      // Generate SVG string
      const svg = await QRCode.toString(url, {
        type: 'svg',
        width: 512,
        margin: 2,
        color: {
          dark: '#1e1b4b',
          light: '#ffffff'
        }
      });
      setQrSvgString(svg);
    } catch (err) {
      console.error('Failed to generate QR Code:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      const envUrl = process.env.NEXT_PUBLIC_APP_URL || '';
      setAppUrlEnv(envUrl);
      
      if (!envUrl) {
        setWarningMsg('Application URL is not configured.');
        setQrPngUrl('');
        setQrSvgString('');
        setCurrentUrlInput('');
      } else {
        setWarningMsg(null);
        setCurrentUrlInput(envUrl);
        generateQRCodes(envUrl);
      }
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleGenerateQR = () => {
    if (!currentUrlInput.trim()) {
      alert('Please enter a valid URL.');
      return;
    }
    setWarningMsg(null);
    generateQRCodes(currentUrlInput.trim());
  };

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && currentUrlInput) {
      navigator.clipboard.writeText(currentUrlInput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadPNG = () => {
    if (!qrPngUrl) return;
    const link = document.createElement('a');
    link.href = qrPngUrl;
    link.download = 'rathayatra_registration_qr.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSVG = () => {
    if (!qrSvgString) return;
    const blob = new Blob([qrSvgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rathayatra_registration_qr.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!qrPngUrl) return;
    const iframe = printFrameRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Print QR Code</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              text-align: center;
              padding: 40px;
              color: #1e1b4b;
            }
            .card {
              max-width: 450px;
              margin: 0 auto;
              border: 3px solid #6366f1;
              border-radius: 24px;
              padding: 30px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            h1 {
              margin-bottom: 5px;
              font-size: 28px;
              color: #4f46e5;
            }
            p {
              color: #64748b;
              font-size: 16px;
              margin-bottom: 25px;
            }
            img {
              width: 300px;
              height: 300px;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 10px;
            }
            .footer {
              margin-top: 25px;
              font-size: 12px;
              color: #94a3b8;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Scan to Register</h1>
            <p>Rathayatra Volunteer Registration Portal</p>
            <img src="${qrPngUrl}" alt="Registration QR Code" />
            <div class="footer">Please scan using your mobile camera or QR reader</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      {/* Hidden iframe for printing */}
      <iframe ref={printFrameRef} className="hidden" title="print_frame" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md glass-card rounded-2xl p-6 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-purple-400" />
            Registration QR Code
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        {warningMsg && (
          <div className="mb-5 p-3.5 bg-yellow-950/40 border border-yellow-500/30 rounded-xl text-yellow-200 text-xs flex flex-col gap-1.5">
            <span className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              {warningMsg}
            </span>
            <p className="text-slate-400 leading-relaxed">
              Configure <code className="bg-slate-950 px-1.5 py-0.5 rounded text-purple-300 font-mono text-[10px]">NEXT_PUBLIC_APP_URL</code> in environment configs, or type a custom URL below for local dev/testing.
            </p>
          </div>
        )}

        {/* QR Display Area */}
        <div className="bg-white p-4 rounded-xl flex items-center justify-center mx-auto mb-6 w-64 h-64 border border-slate-200">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center text-slate-400 text-xs gap-3">
              <div className="relative w-[120px] h-[77px] overflow-hidden">
                <Image 
                  src="/hkm-logo.png" 
                  alt="Hare Krishna Movement" 
                  width={120} 
                  height={77} 
                  priority
                  className="object-contain animate-pulse"
                />
              </div>
              <div className="flex items-center gap-1.5 text-indigo-400">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                <span className="font-semibold text-slate-600">Generating QR Code...</span>
              </div>
            </div>
          ) : qrPngUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrPngUrl} className="w-full h-full" alt="Registration Portal QR Code" />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 text-xs text-center px-4">
              <QrCode className="w-10 h-10 text-slate-300 mb-2 animate-pulse" />
              <span className="text-slate-500 font-medium">Please enter a custom URL and click &quot;Generate QR&quot;</span>
            </div>
          )}
        </div>

        {/* Configuration Details */}
        <div className="space-y-4 mb-6">
          {/* Application URL (Env) */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
              Application URL (Env Config)
            </label>
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-900 text-[11px] text-slate-300 truncate font-mono">
              {appUrlEnv || <span className="text-slate-500 italic">Not Configured</span>}
            </div>
          </div>

          {/* Current QR URL (Editable) */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
              Current QR URL
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex rounded-xl bg-slate-900 border border-slate-800 p-1 focus-within:border-purple-500/30 transition-all">
                <input
                  type="text"
                  value={currentUrlInput}
                  onChange={(e) => setCurrentUrlInput(e.target.value)}
                  placeholder="https://abc123.ngrok-free.app"
                  className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white focus:outline-none truncate"
                />
                {currentUrlInput && (
                  <button
                    onClick={handleCopyLink}
                    className="px-3 rounded-lg bg-purple-950/40 text-purple-300 hover:text-white border border-purple-500/10 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </>
                    )}
                  </button>
                )}
              </div>
              <button
                onClick={handleGenerateQR}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.2)] active:scale-95 shrink-0"
              >
                Generate QR
              </button>
            </div>
          </div>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={downloadPNG}
            disabled={isLoading || !qrPngUrl}
            className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4 text-purple-400" />
            <span>PNG</span>
          </button>
          
          <button
            onClick={downloadSVG}
            disabled={isLoading || !qrSvgString}
            className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4 text-purple-400" />
            <span>SVG</span>
          </button>
          
          <button
            onClick={handlePrint}
            disabled={isLoading || !qrPngUrl}
            className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4 text-purple-400" />
            <span>Print QR</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
