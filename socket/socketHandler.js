module.exports = (io) => {
  const rooms = new Map(); // meetingId → Set of {id, name}

  io.on('connection', (socket) => {

    socket.on('join-room', ({ meetingId, userName }) => {
      socket.join(meetingId);
      socket.data.meetingId = meetingId;
      socket.data.userName  = userName;
      if (!rooms.has(meetingId)) rooms.set(meetingId, new Set());
      rooms.get(meetingId).add({ id: socket.id, name: userName });
      socket.to(meetingId).emit('participant-joined', { id: socket.id, name: userName });
      io.to(meetingId).emit('room-participants', [...rooms.get(meetingId)]);
    });

    socket.on('leave-room', ({ meetingId }) => {
      socket.leave(meetingId);
      if (rooms.has(meetingId)) {
        const set = rooms.get(meetingId);
        for (const p of set) { if (p.id === socket.id) { set.delete(p); break; } }
        if (set.size === 0) rooms.delete(meetingId);
        else io.to(meetingId).emit('room-participants', [...set]);
      }
      socket.to(meetingId).emit('participant-left', { id: socket.id, name: socket.data.userName });
    });

    socket.on('chat-message', ({ meetingId, message, senderName }) => {
      io.to(meetingId).emit('chat-message', { id: Date.now(), senderName, message, timestamp: new Date() });
    });

    socket.on('reaction', ({ meetingId, emoji, senderName }) => {
      io.to(meetingId).emit('reaction', { emoji, senderName, id: socket.id });
    });

    socket.on('transcript-line', ({ meetingId, speaker, text }) => {
      socket.to(meetingId).emit('transcript-line', { speaker, text, timestamp: new Date() });
    });

    socket.on('recording-started', ({ meetingId }) => {
      socket.to(meetingId).emit('recording-started', { by: socket.data.userName });
    });

    socket.on('recording-stopped', ({ meetingId }) => {
      socket.to(meetingId).emit('recording-stopped');
    });

    socket.on('meeting-ended', ({ meetingId }) => {
      io.to(meetingId).emit('meeting-ended');
      rooms.delete(meetingId);
    });

    socket.on('disconnect', () => {
      const { meetingId, userName } = socket.data;
      if (meetingId && rooms.has(meetingId)) {
        const set = rooms.get(meetingId);
        for (const p of set) { if (p.id === socket.id) { set.delete(p); break; } }
        if (set.size === 0) rooms.delete(meetingId);
        else io.to(meetingId).emit('room-participants', [...set]);
        socket.to(meetingId).emit('participant-left', { id: socket.id, name: userName });
      }
    });
  });
};
