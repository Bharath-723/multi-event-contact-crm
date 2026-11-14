'use client';

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { X, Download, Printer, Copy, Check, Loader2, QrCode, Globe, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { useFestival } from '@/lib/contexts/FestivalContext';
import { normalizeQrUrl, resolveFestivalQrUrl } from '@/lib/qr-url-resolver';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  overrideUrl?: string;
  title?: string;
  subtitle?: string;
}

export default function QRModal({ isOpen, onClose, overrideUrl, title, subtitle }: QRModalProps) {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [qrPngUrl, setQrPngUrl] = useState('');
  const [qrSvgString, setQrSvgString] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const { selectedFestival } = useFestival();

  const generateQRCodes = async (url: string) => {
    if (!url) return;
    try {
      setIsLoading(true);
      const png = await QRCode.toDataURL(url, {
        width: 512,
        margin: 2,
        color: {
          dark: '#1e1b4b',
          light: '#ffffff',
        },
      });
      setQrPngUrl(png);

      const svg = await QRCode.toString(url, {
        type: 'svg',
        width: 512,
        margin: 2,
        color: {
          dark: '#1e1b4b',
          light: '#ffffff',
        },
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
      let finalUrl = '';
      if (overrideUrl) {
        finalUrl = normalizeQrUrl(overrideUrl);
      } else {
        finalUrl = resolveFestivalQrUrl(selectedFestival);
      }
      setQrUrl(finalUrl);
      generateQRCodes(finalUrl);
    }
  }, [isOpen, selectedFestival, overrideUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && qrUrl) {
      navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getFileBaseName = () => {
    const raw = title || (overrideUrl ? overrideUrl.replace(/\W+/g, '_') : selectedFestival?.slug || 'mecm_registration');
    const slugified = raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return slugified || 'mecm_qr';
  };

  const downloadPNG = () => {
    if (!qrPngUrl) return;
    const link = document.createElement('a');
    link.href = qrPngUrl;
    link.download = `${getFileBaseName()}_qr.png`;
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
    link.download = `${getFileBaseName()}_qr.svg`;
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

    const isKrishnashtami = selectedFestival?.slug === 'krishnashtami-2026';
    const displayTitle = title || (isKrishnashtami ? 'Krishnashtami Registration' : 'MECM Event Registration');
    const displaySubtitle = subtitle || (overrideUrl?.includes('contacts') ? 'Visitor Contact Registration Portal' : 'Official Online Registration Portal');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${displayTitle} - QR Code Card</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              text-align: center;
              padding: 40px 20px;
              color: #1e1b4b;
              background: #ffffff;
              margin: 0;
            }
            .card {
              max-width: 440px;
              margin: 0 auto;
              border: 3px solid #7c3aed;
              border-radius: 28px;
              padding: 36px 24px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.08);
              background: #ffffff;
            }
            .brand {
              display: inline-block;
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #7c3aed;
              background: #f5f3ff;
              padding: 4px 12px;
              border-radius: 9999px;
              margin-bottom: 12px;
              border: 1px solid #ddd6fe;
            }
            h1 {
              margin: 0 0 6px 0;
              font-size: 26px;
              color: #1e1b4b;
              font-weight: 800;
              letter-spacing: -0.5px;
            }
            p.sub {
              color: #64748b;
              font-size: 14px;
              margin: 0 0 24px 0;
              font-weight: 500;
            }
            .qr-wrapper {
              display: inline-block;
              padding: 14px;
              border: 2px solid #e2e8f0;
              border-radius: 20px;
              background: #ffffff;
            }
            img {
              display: block;
              width: 280px;
              height: 280px;
            }
            .url-box {
              margin-top: 20px;
              padding: 10px 14px;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 13px;
              font-weight: 600;
              color: #475569;
              word-break: break-all;
            }
            .footer {
              margin-top: 20px;
              font-size: 12px;
              color: #94a3b8;
              font-weight: 500;
            }
            @media print {
              body { padding: 0; }
              .card { border-width: 2px; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">MECM Platform</div>
            <h1>Scan to Register</h1>
            <p class="sub">${displayTitle} • ${displaySubtitle}</p>
            <div class="qr-wrapper">
              <img src="${qrPngUrl}" alt="${displayTitle}" />
            </div>
            <div class="url-box">${qrUrl}</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      {/* Hidden iframe for printing */}
      <iframe ref={printFrameRef} className="hidden" title="print_frame" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm glass-card rounded-2xl p-4 sm:p-6 relative overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />

        {/* Header */}
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-purple-400" />
            {title || 'Registration QR Code'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {/* QR Display */}
          <div className="bg-white p-4 rounded-xl flex items-center justify-center mx-auto w-full max-w-[220px] aspect-square border border-slate-200 shrink-0 shadow-sm">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center text-slate-400 text-xs gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <span className="font-semibold text-slate-600">Generating QR...</span>
              </div>
            ) : qrPngUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrPngUrl} className="w-full h-full object-contain" alt="Registration Portal QR Code" />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 text-xs text-center px-4">
                <QrCode className="w-10 h-10 text-slate-300 mb-2" />
                <span className="text-slate-500 font-medium">QR code unavailable</span>
              </div>
            )}
          </div>

          {/* Target URL Info Banner */}
          <div className="bg-slate-900/80 border border-purple-500/20 rounded-xl p-2.5 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-400">
              <Globe className="w-3 h-3 text-purple-400" />
              <span>Destination URL (Production)</span>
            </div>
            <a
              href={qrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono font-medium text-slate-200 hover:text-purple-300 break-all inline-flex items-center gap-1 justify-center transition-colors"
              title="Open link in new tab"
            >
              <span className="truncate max-w-[240px] sm:max-w-[280px]">{qrUrl}</span>
              <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
            </a>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              disabled={!qrUrl}
              className="w-full py-2.5 px-3 rounded-xl bg-purple-950/40 text-purple-300 hover:text-slate-100 border border-purple-500/10 text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy Link
                </>
              )}
            </button>

            {/* PNG and SVG side-by-side */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={downloadPNG}
                disabled={isLoading || !qrPngUrl}
                className="flex items-center justify-center gap-2 p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-slate-100 rounded-xl transition-all cursor-pointer font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 text-purple-400" />
                <span>PNG</span>
              </button>
              
              <button
                onClick={downloadSVG}
                disabled={isLoading || !qrSvgString}
                className="flex items-center justify-center gap-2 p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-slate-100 rounded-xl transition-all cursor-pointer font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 text-purple-400" />
                <span>SVG</span>
              </button>
            </div>
            
            {/* Print */}
            <button
              onClick={handlePrint}
              disabled={isLoading || !qrPngUrl}
              className="w-full flex items-center justify-center gap-2 p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-slate-100 rounded-xl transition-all cursor-pointer font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4 text-purple-400" />
              <span>Print QR Code Card</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
