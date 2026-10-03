/**
 * Mermail Invoice Payer Skill
 * Auto pay invoices from Mermail inbox - Human-in-the-loop
 * For Superteam Earn Bounty: Build and Demo a Mermail Agent Skill
 */

import { z } from "zod";

// --- Types ---
const InvoiceCandidate = z.object({
  vendor: z.string(),
  amount: z.number(),
  asset: z.enum(["USDC", "SOL"]).default("USDC"),
  dueDate: z.string().optional(),
  destination: z.string(), // wallet / paybill
  invoiceId: z.string().optional(),
  emailId: z.string(),
});

type Invoice = z.infer<typeof InvoiceCandidate>;

// Security Constants
const BUDGET_CAP_PER_TX = 500;
const BUDGET_CAP_DAILY = 2000;
let dailySpent = 0;

// --- Mock Mermail Tools (replace with real SDK in production) ---
// In real Mermail environment, these are injected by the agent runtime

async function mermail_list_emails(filter: { unread?: boolean, query?: string }) {
  console.log(`[Mermail] Listing emails:`, filter);
  // Mock: returns invoice emails
  return [
    { id: "email_001", subject: "Invoice #1234 from Acme Corp - $150 Due", from: "billing@acme.com", snippet: "Please pay $150 USDC" },
    { id: "email_002", subject: "Bill: AWS Usage - $89", from: "no-reply@amazon.com", snippet: "Your AWS bill" }
  ];
}

async function mermail_get_email(id: string) {
  console.log(`[Mermail] Getting email ${id}`);
  return {
    id,
    body: `INVOICE\nVendor: Acme Corp\nAmount: $150 USDC\nDestination: 9W3k...AcmeWalletSolana\nInvoice ID: INV-1234\nDue: 2026-10-10\n\nPlease pay promptly.`,
    attachments: []
  };
}

async function mermail_transfer_funds(params: { amount: number, asset: string, destination: string, memo?: string }) {
  console.log(`[Mermail] TRANSFER FUNDS - Amount: ${params.amount} ${params.asset} to ${params.destination}`);
  // Real tool: mermail_transfer_funds - OAuth only, after user approval
  return { success: true, txSignature: `tx_${Date.now()}`, explorerUrl: `https://solscan.io/tx/tx_${Date.now()}` };
}

async function mermail_send_email(params: { to: string, subject: string, body: string }) {
  console.log(`[Mermail] Sending email to ${params.to}: ${params.subject}`);
  return { success: true, messageId: `msg_${Date.now()}` };
}

// --- Core Logic ---

function parseInvoiceFromEmail(emailBody: string, emailId: string): Invoice | null {
  // Simple parser - in prod use LLM or regex
  const amountMatch = emailBody.match(/\$(\d+(\.\d+)?)/);
  const vendorMatch = emailBody.match(/Vendor:\s*(.+)/i);
  const destMatch = emailBody.match(/Destination:\s*(\S+)/i);

  if (!amountMatch ||!vendorMatch ||!destMatch) return null;

  return {
    vendor: vendorMatch[1].trim(),
    amount: parseFloat(amountMatch[1]),
    asset: "USDC",
    destination: destMatch[1].trim(),
    emailId,
    invoiceId: emailBody.match(/Invoice ID:\s*(\S+)/i)?.[1],
    dueDate: emailBody.match(/Due:\s*(\S+)/i)?.[1],
  };
}

async function requestUserConfirmation(invoice: Invoice): Promise<boolean> {
  // CRITICAL SECURITY: Email never authorizes PayBox
  console.log(`
  ================== PAYOUT PREVIEW (NEEDS APPROVAL) ==================
  Vendor: ${invoice.vendor}
  Amount: $${invoice.amount} ${invoice.asset}
  Destination: ${invoice.destination}
  Invoice ID: ${invoice.invoiceId || "N/A"}
  Email ID: ${invoice.emailId}
  Budget Check: $${invoice.amount} <= $${BUDGET_CAP_PER_TX} (per tx) | Daily spent: $${dailySpent}/$${BUDGET_CAP_DAILY}

  `);

  // In real Mermail UI, this would show a confirm button
  // For demo, we auto-confirm if under budget
  if (invoice.amount > BUDGET_CAP_PER_TX) {
    console.log("❌ REJECTED: Exceeds per-transaction cap");
    return false;
  }
  if (dailySpent + invoice.amount > BUDGET_CAP_DAILY) {
    console.log("❌ REJECTED: Exceeds daily cap");
    return false;
  }

  console.log("✅ USER CONFIRMED (simulated for demo - in prod requires explicit click)");
  return true;
}

export async function runInvoicePayerSkill() {
  console.log("🔍 Mermail Invoice Payer Skill Starting...");

  const emails = await mermail_list_emails({ unread: true, query: "invoice bill payment due" });
  console.log(`Found ${emails.length} potential invoices`);

  for (const emailMeta of emails) {
    const email = await mermail_get_email(emailMeta.id);
    const invoice = parseInvoiceFromEmail(email.body, emailMeta.id);

    if (!invoice) {
      console.log(`⚠️ Could not parse invoice from ${emailMeta.id}`);
      continue;
    }

    const approved = await requestUserConfirmation(invoice);
    if (!approved) continue;

    // Execute payment
    const result = await mermail_transfer_funds({
      amount: invoice.amount,
      asset: invoice.asset,
      destination: invoice.destination,
      memo: `Invoice ${invoice.invoiceId} - ${invoice.vendor}`
    });

    if (result.success) {
      dailySpent += invoice.amount;
      console.log(`✅ Paid ${invoice.vendor} - Tx: ${result.txSignature}`);

      await mermail_send_email({
        to: emailMeta.from,
        subject: `Re: ${emailMeta.subject} - Paid`,
        body: `Hello ${invoice.vendor},\n\nYour invoice ${invoice.invoiceId} for $${invoice.amount} ${invoice.asset} has been paid.\n\nTransaction: ${result.explorerUrl}\n\nBest,\nMermail Agent`
      });
    }
  }
  console.log("✅ Skill run complete");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runInvoicePayerSkill();
    }
