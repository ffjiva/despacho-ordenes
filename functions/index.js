const functions = require("firebase-functions");
const https = require("https");

exports.parseDocument = functions.https.onRequest(
  { timeoutSeconds: 300, memory: '1GiB' },
  (req, res) => {
  console.log("Request received:", req.method);
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

  const { base64Data, mediaType } = req.body;
  if (!base64Data || !mediaType) { res.status(400).json({ error: "Missing base64Data or mediaType" }); return; }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) { res.status(500).json({ error: "API key not configured" }); return; }

  const isPDF = mediaType === "application/pdf";
  const contentBlock = isPDF
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } };

  const prompt = `Analiza este documento de orden de envío. Responde SOLO con JSON válido, sin backticks ni texto adicional.

Formato exacto requerido:
{"header":{"orderNumber":"numero","orderDate":"DD/MM/YYYY","origin":"sucursal origen","destination":"sucursal destino"},"products":[{"qty":1,"code":"codigo","name":"NOMBRE EN MAYUSCULAS","family":"categoria"}]}

Reglas:
- orderNumber: solo el número (ejemplo: "18")
- orderDate: fecha en formato DD/MM/YYYY
- origin: nombre de Sucursal Origen
- destination: nombre de Sucursal Destino
- Si un campo no existe usa null
- Extrae TODOS los productos sin omitir ninguno
- qty debe ser número entero`;

  const body = JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: 8000,
    messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }]
  });

  const options = {
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Length": Buffer.byteLength(body)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = "";
    apiRes.on("data", chunk => data += chunk);
apiRes.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) throw new Error(parsed.error.message);
        let text = parsed.content.map(i => i.text || "").join("").trim();
        console.log("Model response preview:", text.substring(0, 300));

        // Limpiar backticks de markdown de forma agresiva
        text = text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        // Intentar como objeto {header, products}
        const objMatch = text.match(/\{[\s\S]*\}/);
        if (objMatch) {
          try {
            const result = JSON.parse(objMatch[0]);
            if (result.products && Array.isArray(result.products)) {
              res.json({ header: result.header || null, products: result.products });
              return;
            }
          } catch(e) {}
        }

        // Intentar como array directo [...]
        const arrMatch = text.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          const products = JSON.parse(arrMatch[0]);
          res.json({ header: null, products });
          return;
        }

        throw new Error("No se pudo extraer productos. Respuesta: " + text.substring(0, 150));
      } catch (e) {
        console.error("Parse error:", e.message);
        res.status(500).json({ error: e.message });
      }
    });
  });

  apiReq.on("error", e => { res.status(500).json({ error: e.message }); });
  apiReq.write(body);
  apiReq.end();
});