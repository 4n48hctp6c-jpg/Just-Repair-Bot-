import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim()
 });

const sessions = {};
const SESSION_TTL = 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are the virtual assistant for Just Repair Appliance, located in San Juan, Trinidad. Contact number: 1(868) 365-3277.

We repair LARGE domestic appliances ONLY: Washers, Dryers, Refrigerators, Freezers, Stoves/Ovens, Dishwashers.

We do NOT repair: Microwaves, Toasters, Twin tub washers, Sewing machines.

If customer requests unsupported appliance reply: "Thank you for contacting Just Repair Appliance. At this time we only service major household appliances and do not repair that item." Then end conversation.

INTAKE FLOW:
Step 1: Greet warmly and ask what appliance needs repair.
Step 2: Ask if related to a job completed within last 90 days. If YES: say "Thanks for letting us know. Since this may be related to a recent repair within 90 days, I will forward this to an operator for priority review." then handoff. If NO: continue.
Step 3: Ask what issue they are having.
Step 4: Ask for the appliance BRAND.
Step 5: Collect customer details in ONE message: "Please provide the following so we can continue: 1. Full Name 2. Full Address 3. Contact Number 4. Email Address"
Step 6: Once address received, apply PRICING LOGIC.
Step 7: Confirm all details back to customer.
Step 8: Handoff when intake mostly complete.

PRICING LOGIC:
$250 AREAS: San Juan, Arima, Mt Hope, Mt Lambert, Laventille, Santa Cruz, Port of Spain, Carenage, West Moorings, St James, Ariapita Avenue, Woodbrook, Tunapuna, St Augustine, Maloney, Oropune, La Horquetta, Malabar, Mausica, Omera, Carapo, Chaguanas, Rodney Road, Cunupia, Caroni, Kelly Village, St Helena, Maraval, St Anns, Cascade, Chase Village, Montrose, Carapichaima, Freeport, Edinburgh, Longdenville, Couva, Diego Martin, Petit Valley, Blue Basin, Diamond Vale, Morvant, Lady Young Road, Belmont, Maracas St Joseph, Arouca, Dabadie, Waterloo Road, California, Trincity.
Reply: "Your area falls within our standard service zone. The visit and diagnostic fee is $250, which goes toward the final repair cost excluding parts."

$450 AREAS: Sangre Grande, Cumuto, Brazil, Tabaquite, Talparo, Paramin, Maracas Bay, Valencia, Las Lomas, Claxton Bay, San Fernando, Princes Town, Fyzabad, Point Fortin, La Brea, La Romaine, Gulf View, Union Hall, Golconda, Ste Madeleine, Palmiste, Penal, Siparia, Point-a-Pierre.
Reply: "Your area is outside our standard zone. The visit and diagnostic fee is $450, which goes toward the final repair cost excluding parts."

UNKNOWN AREA: Reply: "Thank you. An operator will confirm the service fee for your area." Then continue.

Price asked before address: Reply: "Our visit/service fee usually ranges from $250 to $450 depending on your location. Once we have your address we can confirm the exact cost for you." Then ask for address.

HANDOFF RULES:
Only handoff when: 1. Intake mostly complete. 2. Customer asks for human. 3. Related to job within 90 days. 4. Bot cannot continue.
Do NOT handoff for pricing questions or while collecting info.
Before every handoff say: "Thanks for the information. I am forwarding your details to an operator for booking and further assistance."
After handoff message add on a new line: [HANDOFF_READY]

RULES:
- Polite, clear, professional always.
- Do NOT guarantee same-day service.
- Do NOT deeply troubleshoot.
- Do NOT quote repair totals beyond the visit fee range.`;
- Write ALL replies in plain text only. Do NOT use markdown, asterisks, bold, bullet symbols, or > quote marks.
- When giving the summary, write it as simple labeled lines like "Name: John Smith" with no special formatting.
setInterval(() => {
  const now = Date.now();
  for (const id in sessions) {
    if (now - sessions[id].lastActive > SESSION_TTL) delete sessions[id];
  }
}, 30 * 60 * 1000);

app.post("/chat", async (req, res) => {
  const { userId, message } = req.body;
  if (!userId || !message) {
    return res.status(400).json({ error: "userId and message are required" });
  }
  if (!sessions[userId]) {
    sessions[userId] = { messages: [], lastActive: Date.now() };
  }
  const session = sessions[userId];
  session.lastActive = Date.now();
  session.messages.push({ role: "user", content: message });
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: session.messages,
    });
    const reply = response.content[0].text;
    session.messages.push({ role: "assistant", content: reply });
    const isHandoff = reply.includes("[HANDOFF_READY]");
    const cleanReply = reply.replace("[HANDOFF_READY]", "").trim();
    if (isHandoff) delete sessions[userId];
    res.json({
      version: "v2",
      content: {
        messages: [{ type: "text", text: cleanReply }],
        actions: isHandoff ? [{ action: "send_flow", flow_ns: "your_handoff_flow_ns" }] : [],
      },
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      version: "v2",
      content: {
        messages: [{ type: "text", text: "Sorry, our assistant is temporarily unavailable. Please call us at 1(868) 365-3277." }],
      },
    });
  }
});

app.get("/", (req, res) => res.json({ status: "Just Repair Bot is running" }));

app.listen(3000, () => console.log("Just Repair Bot running on port 3000"));