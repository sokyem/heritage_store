'use client';

import { useState, useRef } from 'react';

interface MediaUploadProps {
  value?: string;
  onChange: (url: string) => void;
  folder?: string;
  accept?: 'image' | 'video' | 'both';
  label?: string;
  previewHeight?: string;
}

export default function MediaUpload({
  value,
  onChange,
  folder = 'general',
  accept = 'image',
  label = 'Upload',
  previewHeight = '180px',
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptTypes = accept === 'video'
    ? 'video/mp4,video/webm,video/quicktime'
    : accept === 'both'
    ? 'image/jpeg,image/png,image/webp,video/mp4,video/webm'
    : 'image/jpeg,image/png,image/webp';

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError('');

    const resourceType = file.type.startsWith('video/') ? 'video' : 'image';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    formData.append('type', resourceType);

    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      onChange(data.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const isVideo = value?.includes('.mp4') || value?.includes('.webm') || value?.includes('/video/');

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-2">{label}</p>

      {/* Preview */}
      {value && (
        <div className="relative mb-3 rounded-lg overflow-hidden bg-[#F0EBE3]" style={{ height: previewHeight }}>
          {isVideo ? (
            <video src={value} className="w-full h-full object-cover" controls muted />
          ) : (
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
          )}
          <button
            onClick={() => onChange('')}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-xs"
          >
            &times;
          </button>
        </div>
      )}

      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-[#1B2A5B] bg-[#1B2A5B]/5'
            : 'border-[#D1D5DB] hover:border-[#8B7569] bg-white'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-[#1B2A5B] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-[#8B7569]">Uploading...</span>
          </div>
        ) : (
          <>
            <svg className="w-8 h-8 mx-auto text-[#8B7569] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-[#8B7569]">
              Drop {accept === 'video' ? 'a video' : accept === 'both' ? 'an image or video' : 'an image'} here, or <span className="text-[#1B2A5B] font-semibold">browse</span>
            </p>
            <p className="text-[10px] text-[#8B7569]/60 mt-1 uppercase tracking-wider">
              {accept === 'video' ? 'MP4, WebM — max 50MB' : accept === 'both' ? 'JPEG, PNG, WebP, MP4 — max 50MB' : 'JPEG, PNG, WebP — max 10MB'}
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* URL fallback */}
      <div className="mt-2">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste a URL..."
          className="w-full text-xs border border-[#E5E7EB] rounded-md px-3 py-2 text-[#8B7569] focus:border-[#1B2A5B] focus:ring-1 focus:ring-[#1B2A5B] transition-colors"
        />
      </div>

      {error && (
        <p className="text-xs text-[#C41E3A] mt-1">{error}</p>
      )}
    </div>
  );
}
