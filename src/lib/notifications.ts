// Handle Notifications
// src/lib/notifications.ts

import axios from "@/lib/axios";

const API_URL = `${process.env.NEXT_PUBLIC_SUPABASE_API_URL}/manage-notifications`;

export const fetchNotifications = async (page = 1, limit = 15) => {
  const res = await axios.get(API_URL, {
    params: { page, limit }
  });
  
  return res.data;
};

export const createNotification = async (data: { title: string; description: string; topic?: string }) => {
  const res = await axios.post(API_URL, data);
  return res.data;
};

export const markNotificationRead = async (id?: number, all?: boolean) => {
  const res = await axios.patch(API_URL, { id, all });
  return res.data;
};