/**
 * NUQTHA — Razorpay Server-Side Webhook Handler
 * 
 * Secure endpoint to receive Razorpay webhook events (payment.captured, order.paid).
 * Verifies HMAC SHA-256 signature and automatically records/updates purchases
 * in the Firestore `purchases` collection, ensuring 100% reliable book unlocking.
 */

import crypto from "crypto";

const FIRESTORE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "nuqtha-c0900";
const FIRESTORE_API_KEY = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e3HE";

// Razorpay webhook secret configured in Razorpay Dashboard -> Webhooks
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || "nuqtha_rzp_sec_2026";

/**
 * Helper to write a purchase record to Firestore via REST API
 */
async function recordVerifiedPurchase({
    bookId,
    bookTitle,
    userId,
    userEmail,
    userName,
    amount,
    currency,
    paymentId,
    orderId,
    event
}) {
    if (!bookId || !paymentId) return false;

    // Check if purchase with this paymentId already exists to avoid duplicate entries
    try {
        const queryUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
        const queryBody = {
            structuredQuery: {
                from: [{ collectionId: "purchases" }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "paymentId" },
                        op: "EQUAL",
                        value: { stringValue: String(paymentId) }
                    }
                },
                limit: 1
            }
        };

        const checkRes = await fetch(queryUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(queryBody)
        });

        if (checkRes.ok) {
            const results = await checkRes.json();
            if (Array.isArray(results) && results[0] && results[0].document) {
                console.log(`[Webhook] Purchase for paymentId ${paymentId} already recorded.`);
                return true;
            }
        }
    } catch (checkErr) {
        console.warn("[Webhook] Purchase duplicate check warning:", checkErr);
    }

    // Insert new verified purchase
    const insertUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/purchases?key=${FIRESTORE_API_KEY}`;
    const nowIso = new Date().toISOString();

    const fields = {
        bookId: { stringValue: String(bookId).trim() },
        bookTitle: { stringValue: String(bookTitle || "Premium Book").trim() },
        userId: { stringValue: String(userId || "user_" + paymentId).trim() },
        userEmail: { stringValue: String(userEmail || "").toLowerCase().trim() },
        userName: { stringValue: String(userName || "വായനക്കാരൻ").trim() },
        amount: { doubleValue: Number(amount) || 0 },
        currency: { stringValue: String(currency || "INR").toUpperCase() },
        paymentId: { stringValue: String(paymentId).trim() },
        orderId: { stringValue: String(orderId || "").trim() },
        status: { stringValue: "completed" },
        verified: { booleanValue: true },
        source: { stringValue: "webhook" },
        event: { stringValue: String(event || "payment.captured") },
        createdAt: { timestampValue: nowIso },
        updatedAt: { timestampValue: nowIso }
    };

    const res = await fetch(insertUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error("[Webhook] Failed to save purchase in Firestore:", errText);
        return false;
    }

    console.log(`[Webhook] Verified purchase recorded in Firestore for book ${bookId}, payment ${paymentId}`);
    return true;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const signature = req.headers["x-razorpay-signature"];
        if (!signature) {
            console.warn("[Webhook] Missing x-razorpay-signature header");
            return res.status(400).json({ error: "Missing webhook signature" });
        }

        // Parse raw body string for cryptographic verification
        const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac("sha256", WEBHOOK_SECRET)
            .update(rawBody)
            .digest("hex");

        if (signature !== expectedSignature) {
            console.warn("[Webhook] Invalid signature mismatch");
            return res.status(400).json({ error: "Invalid signature" });
        }

        const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const event = payload.event;
        console.log(`[Webhook] Verified Razorpay event received: ${event}`);

        // Handle successful payment events
        if (event === "payment.captured" || event === "order.paid") {
            const payment = payload.payload?.payment?.entity;
            if (!payment) {
                return res.status(200).json({ status: "ignored_missing_entity" });
            }

            const paymentId = payment.id;
            const orderId = payment.order_id || "";
            const amount = (payment.amount || 0) / 100;
            const currency = payment.currency || "INR";
            const userEmail = payment.email || "";
            const userName = payment.notes?.userName || "";
            const bookId = payment.notes?.bookId || payment.notes?.book_id || "";
            const bookTitle = payment.notes?.bookTitle || payment.notes?.book_title || "Premium Book";
            const userId = payment.notes?.userId || payment.notes?.user_id || userEmail || "guest_" + paymentId;

            if (bookId) {
                await recordVerifiedPurchase({
                    bookId,
                    bookTitle,
                    userId,
                    userEmail,
                    userName,
                    amount,
                    currency,
                    paymentId,
                    orderId,
                    event
                });
            } else {
                console.warn("[Webhook] Payment captured without bookId in notes:", paymentId);
            }
        }

        return res.status(200).json({ status: "ok", received: true });

    } catch (err) {
        console.error("[Webhook] Handler error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}

