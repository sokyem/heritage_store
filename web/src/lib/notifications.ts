/**
 * Utility function to create notifications
 * Used by API routes and server actions
 */

interface NotificationPayload {
  userId: string;
  type: 'order_status_changed' | 'order_assigned' | 'measurement_uploaded' | 'designer_assigned' | 'consultation_scheduled' | 'shipment_status_changed' | 'shipment_delivered' | 'return_approved' | 'return_refunded';
  title: string;
  message: string;
  relatedId?: string;
}

export async function createNotification(payload: NotificationPayload) {
  try {
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Failed to create notification:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

export function getNotificationMessage(type: string, context: any): { title: string; message: string } {
  switch (type) {
    case 'order_status_changed':
      return {
        title: 'Order Status Updated',
        message: `Your order for ${context.product} has been moved to ${context.status}`,
      };
    case 'order_assigned':
      return {
        title: 'Designer Assigned',
        message: `${context.designer} has been assigned to your order`,
      };
    case 'measurement_uploaded':
      return {
        title: 'Measurements Recorded',
        message: `Your measurements have been saved with ${context.accuracy}% accuracy`,
      };
    case 'designer_assigned':
      return {
        title: 'New Order Assigned',
        message: `You have been assigned a new order: ${context.product}`,
      };
    case 'consultation_scheduled':
      return {
        title: 'Consultation Scheduled',
        message: `Your consultation is scheduled for ${context.date}`,
      };
    case 'shipment_status_changed':
      return {
        title: 'Shipment Update',
        message: `Your shipment ${context.shipmentId} is now ${context.status?.replace(/_/g, ' ')}`,
      };
    case 'shipment_delivered':
      return {
        title: 'Order Delivered!',
        message: `Your shipment ${context.shipmentId} has been delivered. Track: ${context.trackingNumber || 'N/A'}`,
      };
    case 'return_approved':
      return {
        title: 'Return Approved',
        message: `Your return request ${context.returnId} has been approved. A return label has been sent.`,
      };
    case 'return_refunded':
      return {
        title: 'Refund Processed',
        message: `Your refund of $${context.amount} for return ${context.returnId} has been processed.`,
      };
    default:
      return {
        title: 'Notification',
        message: 'You have a new notification',
      };
  }
}
