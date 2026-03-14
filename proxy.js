const http = require("http");
const https = require("https");

const PORT = 3001;

const server = http.createServer((req, res) => {
  // Allow requests from the React app
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/claude") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      const apiKey = "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";
      if (!apiKey) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No API key found in .env file" }));
        return;
      }

      const payload = Buffer.from(body);
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": payload.length,
        },
      };

      const proxyReq = https.request(options, proxyRes => {
        let data = "";
        proxyRes.on("data", chunk => (data += chunk));
        proxyRes.on("end", () => {
          res.writeHead(proxyRes.statusCode, { "Content-Type": "application/json" });
          res.end(data);
        });
      });

      proxyReq.on("error", err => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });

      proxyReq.write(payload);
      proxyReq.end();
    });
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`✅ JobPilot proxy running on http://localhost:${PORT}`);
  console.log(`   API key: ${process.env.REACT_APP_ANTHROPIC_KEY ? "Found ✓" : "MISSING ✗"}`);
})
