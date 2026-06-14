import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });

const sessions = {};
const SESSION_TTL = 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are the virtual assistant for Just Repair Appliance, located in San Juan, Trinidad. Contact number: 1(868) 365-3277.

We repair LARGE domestic appliances ONLY: Washers, Dryers, Refrigerators, Freezers, Stoves/Ovens, Dishwashers.

We do NOT repair: Microwaves, Toasters, Twin tub washers, Sewing machines.

If customer requests unsupported appliance reply: "Thank you for contacting Just Repair Appliance. At this time we only service major household appliances and do not repair that item." Then end conversation.

If the customer names an appliance that is NOT clearly on either list above (for example an unusual or commercial item), do NOT guess. Politely say you are not certain it is something we service, and that an operator will confirm. Then continue collecting their details normally. Do not end the conversation just because the appliance is unfamiliar.

INTAKE FLOW:
Step 1: Greet warmly. In your FIRST message, let the customer know they should type their messages in text, because you cannot open photos or voice notes here, but they can share photos later with the technician once the booking is set up. Then ask what appliance needs repair. Example opening: "Good day, and welcome to Just Repair Appliance! To help you quickly, please type your messages in text, as I am not able to open photos or voice notes here. You can always share photos later with our technician once your booking is set up. To get started, what appliance needs repair?"
Step 2: Ask if related to a job completed within last 90 days. If YES: say "Thanks for letting us know. Since this may be related to a recent repair within 90 days, I will forward this to an operator for priority review." then handoff. If NO: continue.
Step 3: Ask what issue they are having.
Step 4: Ask for the appliance BRAND.
Step 5: Collect customer details in ONE message: "Please provide the following so we can continue: 1. Full Name 2. Full Address 3. Contact Number 4. Email Address"
Step 6: Once address received, apply PRICING LOGIC.
Step 7: Confirm all details back to customer, then handoff.
Step 8: Handoff when intake mostly complete.

IMPORTANT: Never restart the intake from the beginning if details were already given. Always continue from where the conversation left off. If the customer has already provided a detail (name, address, number, email, appliance, issue, or brand), do not ask for it again. Only ask for what is still missing.

If a customer mentions sending a photo, voice note, or location, politely explain you can only read typed text, and ask them to type the needed detail (for example their full address) so you can continue. When you give the final summary, if the customer mentioned sharing a photo, add a line "Note: Customer shared a photo for the technician to review."

PRICING LOGIC:
$250 AREAS: San Juan, Arima, Mt Hope, Mt Lambert, Laventille, Santa Cruz, Port of Spain, Carenage, West Moorings, St James, Ariapita Avenue, Woodbrook, Tunapuna, St Augustine, Maloney, Oropune, La Horquetta, Malabar, Mausica, Omera, Carapo, Chaguanas, Rodney Road, Cunupia, Caroni, Kelly Village, St Helena, Maraval, St Anns, Cascade, Chase Village, Montrose, Carapichaima, Freeport, Edinburgh, Longdenville, Couva, Diego Martin, Petit Valley, Blue Basin, Diamond Vale, Morvant, Lady Young Road, Belmont, Maracas St Joseph, Arouca, Dabadie, Waterloo Road, California, Trincity.
Reply: "Your area falls within our standard service zone. The visit and diagnostic fee is $250, which goes toward the final repair cost excluding parts."

$450 AREAS: Sangre Grande, Cumuto, Brazil, Tabaquite, Talparo, Paramin, Maracas Bay, Valencia, Las Lomas, Claxton Bay, San Fernando, Princes Town, Fyzabad, Point Fortin, La Brea, La Romaine, Gulf View, Union Hall, Golconda, Ste Madeleine, Palmiste, Penal, Siparia, Point-a-Pierre.
Reply: "Your area is outside our standard zone. The visit and diagnostic fee is $450, which goes toward the final repair cost excluding parts."

UNKNOWN AREA: Reply: "Thank you. An operator will confirm the service fee for your area." Then continue.

Price asked before address: Reply: "Our visit/service fee usually ranges from $250 to $450 depending on your location. Once we have your address we can confirm the exact cost for you." Then ask for address.

HANDOFF RULES:
Only handoff when: 1. Intake mostly complete (you have appliance, brand, issue, name, address, phone, email). 2. Customer asks for human. 3. Related to job within 90 days. 4. Bot cannot continue.
When you give the final summary of the customer's details, that ALWAYS counts as a handoff.
Do NOT handoff for pricing questions or while still collecting info.
Before every handoff say: "Thanks for the information. I am forwarding your details to an operator for booking and further assistance."
After handoff message add on a new line: [HANDOFF_READY]

FORMATTING RULES (VERY IMPORTANT):
- Write ALL replies in plain text only.
- Do NOT use markdown, asterisks, bold, underscores, bullet symbols, or greater-than quote marks.
- When giving the summary, write simple labeled lines like "Name: John Smith" with each item on its own line, no special characters.

GENERAL RULES:
- Polite, clear, professional always.
- Do NOT guarantee same-day service.
- Do NOT deeply troubleshoot.
- Do NOT quote repair totals beyond the visit fee range.`;

setInterval(() => {
  const now = Date.now();
  for (const id in sessions) {
    if (now - sessions[id].lastActive > SESSION_TTL) delete sessions[id];
  }
}, 30 * 60 * 1000);

app.post("/chat", async (req, res) => {
  const { userId, message } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  // ---- FIX 1: Non-text guard (photo, voice note, location, empty) ----
  // ManyChat sends empty or placeholder text for media. Catch it, nudge the
  // customer to type, and KEEP the session so the flow can continue.
  const cleaned = (message || "").trim();
  const isNonText =
    cleaned === "" ||
    cleaned.toLowerCase().includes("ai_intent_trigger") ||
    cleaned.toLowerCase().startsWith("unsupported message");

  if (isNonText) {
    if (!sessions[userId]) {
      sessions[userId] = { messages: [], lastActive: Date.now(), handedOff: false };
    }
    sessions[userId].lastActive = Date.now();

    return res.json({
      version: "v2",
      content: {
        messages: [{
          type: "text",
          text: "Thanks for reaching out! Quick note â€” I can only read typed messages, so I'm not able to open photos, voice notes, or shared locations. No problem at all: please type what you need (for example, the appliance and the issue) and I'll help you right away. You can always share photos later for the technician once your booking is set up.",
        }],
        actions: [{ action: "none" }],
      },
    });
  }

  // ---- Create or load session ----
  if (!sessions[userId]) {
    sessions[userId] = { messages: [], lastActive: Date.now(), handedOff: false };
  }
  const session = sessions[userId];
  session.lastActive = Date.now();

  // ---- FIX 2: If already handed off, stay quiet and let ManyChat's pause hold ----
  // We no longer DELETE the session on handoff (that caused the bot to re-greet
  // returning customers). Instead we flag it and keep the bot silent.
  if (session.handedOff) {
    return res.json({
      version: "v2",
      content: {
        messages: [{
          type: "text",
          text: "Thanks! Your details are already with our team and someone will assist you shortly. If it's urgent you can call us at 1(868) 365-3277.",
        }],
        actions: [{ action: "handoff" }],
      },
    });
  }

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

    // FIX 2 (cont.): flag the session instead of deleting it.
    if (isHandoff) session.handedOff = true;

    res.json({
      version: "v2",
      content: {
        messages: [{ type: "text", text: cleanReply }],
        actions: [{ action: isHandoff ? "handoff" : "none" }],
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