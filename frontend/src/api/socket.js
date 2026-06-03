import { io } from 'socket.io-client';

// Single shared socket for real-time campaign/message status updates.
export const socket = io('/', { autoConnect: true, transports: ['websocket', 'polling'] });

export default socket;
