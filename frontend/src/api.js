import { io } from "socket.io-client";

export const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";
export const socket = io(backendUrl);
