// Node.js example (development only)
// Requires: npm i puppeteer ws
const puppeteer = require('puppeteer');
const WebSocket = require('ws');

async function start() {
  const wss = new WebSocket.Server({ port: 8081 });
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('https://example.com');

  const client = await page.target().createCDPSession();
  await client.send('Page.enable');

  // Start screencast (jpeg frames)
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 1280, maxHeight: 720 });

  client.on('Page.screencastFrame', async (event) => {
    // event.data is base64 jpeg
    const payload = Buffer.from(event.data, 'base64');
    // Broadcast binary to all ws clients
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        // we will prefix with a small JSON header so client can route events
        // Here: 0x01 = frame
        const header = Buffer.from([0x01]);
        ws.send(Buffer.concat([header, payload]));
      }
    });
    // Acknowledge the frame to Chrome
    await client.send('Page.screencastFrameAck', { sessionId: event.sessionId });
  });

  wss.on('connection', (ws) => {
    console.log('client connected');

    ws.on('message', (msg) => {
      // JSON control messages: clicks, cursor, or commands
      try {
        const s = msg.toString();
        const data = JSON.parse(s);
        if (data.type === 'click') {
          page.mouse.click(data.x, data.y);
        } else if (data.type === 'navigate') {
          page.goto(data.url);
        }
      } catch (e) {
        // ignore binary frames
      }
    });

    ws.on('close', () => console.log('client disconnected'));
  });

  console.log('Screencast server running on ws://localhost:8081');
}
start().catch(console.error);
