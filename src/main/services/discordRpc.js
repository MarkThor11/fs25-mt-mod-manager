const net = require('net');
const EventEmitter = require('events');

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

class DiscordRpcClient extends EventEmitter {
  constructor(clientId) {
    super();
    this.clientId = clientId || '1540472048449495110'; // default client ID
    this.socket = null;
    this.isConnected = false;
    this.currentActivity = null;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.socket) {
      try { this.socket.destroy(); } catch (_) {}
    }

    const tryPipe = (pipeIndex = 0) => {
      if (pipeIndex > 9) {
        // Retry in 30s if Discord is not currently running
        this.reconnectTimer = setTimeout(() => this.connect(), 30000);
        return;
      }

      const pipePath = `\\\\?\\pipe\\discord-ipc-${pipeIndex}`;
      const socket = net.createConnection(pipePath);

      socket.on('connect', () => {
        this.socket = socket;
        this.sendPacket(OP_HANDSHAKE, {
          v: 1,
          client_id: this.clientId
        });
      });

      socket.on('data', (data) => {
        try {
          if (data.length < 8) return;
          const op = data.readInt32LE(0);
          const len = data.readInt32LE(4);
          const payloadStr = data.slice(8, 8 + len).toString('utf8');
          const payload = JSON.parse(payloadStr);

          if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
            this.isConnected = true;
            this.emit('ready', payload.data);
            if (this.currentActivity) {
              this.setActivity(this.currentActivity);
            }
          }
        } catch (_) {}
      });

      socket.on('error', () => {
        try { socket.destroy(); } catch (_) {}
        tryPipe(pipeIndex + 1);
      });

      socket.on('close', () => {
        this.isConnected = false;
        this.socket = null;
      });
    };

    tryPipe(0);
  }

  sendPacket(op, data) {
    if (!this.socket) return;
    const json = Buffer.from(JSON.stringify(data), 'utf8');
    const header = Buffer.alloc(8);
    header.writeInt32LE(op, 0);
    header.writeInt32LE(json.length, 4);
    try {
      this.socket.write(Buffer.concat([header, json]));
    } catch (_) {}
  }

  setActivity(activity) {
    this.currentActivity = activity;
    if (!this.isConnected || !this.socket) return;

    this.sendPacket(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: activity || null
      },
      nonce: `${Date.now()}-${Math.random()}`
    });
  }

  clearActivity() {
    this.currentActivity = null;
    this.setActivity(null);
  }

  destroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      try { this.socket.destroy(); } catch (_) {}
      this.socket = null;
    }
    this.isConnected = false;
  }
}

let instance = null;

function getDiscordRpc() {
  if (!instance) {
    instance = new DiscordRpcClient();
  }
  return instance;
}

module.exports = {
  DiscordRpcClient,
  getDiscordRpc
};
