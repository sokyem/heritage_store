'use client';

import { useState, useEffect } from 'react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

let toastId = 0;
const toasters: Set<(toast: Toast) => void> = new Set();

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handleAddToast = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    };

    toasters.add(handleAddToast);
    return () => {
      toasters.delete(handleAddToast);
    };
  }, []);

  const showToast = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ) => {
    const toast: Toast = {
      id: String(toastId++),
      type,
      title,
      message,
    };
    toasters.forEach((toaster) => toaster(toast));
  };

  return { toasts, showToast };
}

export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 right-4 space-y-3 z-[9999]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg shadow-lg p-4 animate-slide-in-up max-w-sm ${
            toast.type === 'success'
              ? 'bg-green-50 border-l-4 border-green-500'
              : toast.type === 'error'
              ? 'bg-red-50 border-l-4 border-red-500'
              : 'bg-blue-50 border-l-4 border-blue-500'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-lg">
              {toast.type === 'success'
                ? '✓'
                : toast.type === 'error'
                ? '✕'
                : 'ℹ'}
            </span>
            <div>
              <p className="font-medium text-sm">{toast.title}</p>
              <p className="text-xs text-gray-600 mt-1">{toast.message}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export const showSuccessToast = (title: string, message: string) => {
  const toast: Toast = {
    id: String(toastId++),
    type: 'success',
    title,
    message,
  };
  toasters.forEach((toaster) => toaster(toast));
};

export const showErrorToast = (title: string, message: string) => {
  const toast: Toast = {
    id: String(toastId++),
    type: 'error',
    title,
    message,
  };
  toasters.forEach((toaster) => toaster(toast));
};

export const showInfoToast = (title: string, message: string) => {
  const toast: Toast = {
    id: String(toastId++),
    type: 'info',
    title,
    message,
  };
  toasters.forEach((toaster) => toaster(toast));
};
