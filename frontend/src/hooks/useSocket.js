import { useEffect } from "react";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export const useSocket = (event, callback) => {
  useEffect(() => {
    const socket = io(socketUrl);
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
      socket.disconnect();
    };
  }, [event, callback]);
};
