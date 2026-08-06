import { io } from "socket.io-client";

export const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
export const socket = io(backendUrl);
