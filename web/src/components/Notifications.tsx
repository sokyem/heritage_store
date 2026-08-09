'use client';

import { useEffect, useState } from 'react';

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  timestamp: Date;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    // Mock real-time notifications
    const mockNotifications: Notification[] = [
      {
        id: '1',
        message: 'Your consultation is scheduled for tomorrow at 2 PM',
        type: 'info',
        timestamp: new Date(),
      },
      {
        id: '2',
        message: 'New collection available: Spring 2026',
        type: 'success',
        timestamp: new Date(Date.now() - 3600000),
      },
      {
        id: '3',
        message: 'Measurement photo approved for your order',
        type: 'success',
        timestamp: new Date(Date.now() - 7200000),
      },
    ];
    setNotifications(mockNotifications);
  }, []);

  const dismissNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`p-4 rounded shadow-lg max-w-sm ${
            notification.type === 'success' ? 'bg-green-100 border-green-500' :
            notification.type === 'warning' ? 'bg-yellow-100 border-yellow-500' :
            'bg-blue-100 border-blue-500'
          } border-l-4`}
        >
          <div className="flex justify-between items-start">
            <p className="text-sm">{notification.message}</p>
            <button
              onClick={() => dismissNotification(notification.id)}
              className="ml-2 text-gray-500 hover:text-gray-700"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {notification.timestamp.toLocaleTimeString()}
          </p>
        </div>
      ))}
    </div>
  );
}