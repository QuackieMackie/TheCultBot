import fs   from 'fs';
import path from 'path';
import { Client, Events } from 'discord.js';
import { DATA_DIR } from 'utils/storage';

const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat');
const INTERVAL_MS    = 30_000;

// Writes the current timestamp to a heartbeat file the Docker HEALTHCHECK reads, so an
// alive-but-disconnected process is reported unhealthy. Only beats while the gateway is ready.
export function startHeartbeat(client: Client): void {
    const beat = () => {
        if (!client.isReady()) return;
        try {
            fs.writeFileSync(HEARTBEAT_FILE, String(Date.now()));
        } catch (err) {
            console.error('Heartbeat write failed:', err);
        }
    };

    client.once(Events.ClientReady, beat);
    setInterval(beat, INTERVAL_MS).unref();
}
